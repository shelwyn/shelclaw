import type { Provider, Usage } from '../types.js'
import type { ChatTurn, ProviderAdapter, StreamPart, StreamRequest } from './types.js'
import {
  ensureV1,
  getJson,
  joinUrl,
  normalizeUsage,
  parseToolArguments,
  postJson,
  readSSE,
  safeJsonParse,
} from './http.js'

function providerBase(provider: Provider): string {
  if (provider.baseUrl) return provider.baseUrl
  switch (provider.kind) {
    case 'openai':
      return 'https://api.openai.com/v1'
    case 'ollama':
      return 'http://127.0.0.1:11434'
    default:
      return ''
  }
}

export function authHeaders(provider: Provider): Record<string, string> {
  const headers: Record<string, string> = {}
  const extra = (provider.config?.headers || {}) as Record<string, string>
  Object.assign(headers, extra)
  if (provider.kind === 'azure') {
    if (provider.apiKey) headers['api-key'] = provider.apiKey
  } else if (provider.apiKey) {
    headers.authorization = `Bearer ${provider.apiKey}`
  }
  return headers
}

export function openAIUrl(provider: Provider, model: string): string {
  const base = providerBase(provider)
  const config = provider.config || {}
  if (typeof config.chatPath === 'string' && config.chatPath) {
    return joinUrl(base, config.chatPath)
  }

  if (provider.kind === 'azure') {
    const version = provider.apiVersion || '2024-10-21'
    if (/\/chat\/completions/i.test(base)) {
      return base.includes('api-version=')
        ? base
        : `${base}${base.includes('?') ? '&' : '?'}api-version=${encodeURIComponent(version)}`
    }
    if (/\/openai\/deployments\//i.test(base)) {
      return `${base.replace(/\/+$/, '')}/chat/completions?api-version=${encodeURIComponent(version)}`
    }
    return `${base.replace(/\/+$/, '')}/openai/deployments/${encodeURIComponent(model)}/chat/completions?api-version=${encodeURIComponent(version)}`
  }

  if (provider.kind === 'ollama') {
    const root = base.replace(/\/v1\/?$/i, '').replace(/\/+$/, '')
    return `${root}/v1/chat/completions`
  }

  return `${ensureV1(base)}/chat/completions`
}

function toOpenAIMessages(messages: ChatTurn[]): any[] {
  return messages.map((message) => {
    if (message.role === 'assistant') {
      const out: any = { role: 'assistant', content: message.content || null }
      if (message.toolCalls?.length) {
        out.tool_calls = message.toolCalls.map((call) => ({
          id: call.id,
          type: 'function',
          function: { name: call.name, arguments: call.arguments || '{}' },
        }))
      }
      return out
    }
    if (message.role === 'tool') {
      return {
        role: 'tool',
        tool_call_id: message.toolCallId || '',
        content: message.content,
        ...(message.name ? { name: message.name } : {}),
      }
    }
    return { role: message.role, content: message.content }
  })
}

function buildBody(req: StreamRequest): Record<string, unknown> {
  const { provider, model, messages, tools } = req
  const config = provider.config || {}
  const body: Record<string, unknown> = {
    model,
    messages: toOpenAIMessages(messages),
    stream: true,
  }
  if (typeof req.temperature === 'number') body.temperature = req.temperature
  const maxTokens = req.maxTokens ?? (typeof config.maxTokens === 'number' ? config.maxTokens : undefined)
  if (maxTokens) {
    const tokenParam = typeof config.tokenParam === 'string' ? config.tokenParam : 'max_tokens'
    body[tokenParam] = maxTokens
  }
  if (tools.length && config.tools !== false) {
    body.tools = tools.map((tool) => ({
      type: 'function',
      function: { name: tool.name, description: tool.description, parameters: tool.parameters },
    }))
    body.tool_choice = 'auto'
  }
  const usageStreaming =
    config.streamUsage === true ||
    (config.streamUsage !== false && (provider.kind === 'openai' || provider.kind === 'azure'))
  if (usageStreaming) body.stream_options = { include_usage: true }
  if (config.extraBody && typeof config.extraBody === 'object') {
    Object.assign(body, config.extraBody as Record<string, unknown>)
  }
  return body
}

type AccumulatedCall = { id: string; name: string; args: string }

function applyChunk(
  payload: any,
  calls: Map<number, AccumulatedCall>,
  usage: Usage,
): { text: string; reasoning: string; done: boolean } {
  if (payload?.error) {
    throw new Error(payload.error.message || JSON.stringify(payload.error))
  }
  let text = ''
  let reasoning = ''
  if (payload?.usage) Object.assign(usage, normalizeUsage(payload.usage))
  const choice = payload?.choices?.[0]
  if (!choice) return { text, reasoning, done: false }
  const delta = choice.delta || choice.message || {}
  const content = delta.content
  if (typeof content === 'string') text = content
  else if (Array.isArray(content)) {
    text = content.map((part: any) => (typeof part === 'string' ? part : part?.text || '')).join('')
  }
  reasoning = delta.reasoning_content || delta.reasoning || delta.thinking || ''
  if (Array.isArray(delta.tool_calls)) {
    for (const [fallbackIndex, toolCall] of delta.tool_calls.entries()) {
      const index = typeof toolCall.index === 'number' ? toolCall.index : fallbackIndex
      const entry = calls.get(index) || { id: '', name: '', args: '' }
      if (toolCall.id) {
        // Some providers reuse ids across turns; only set when empty.
        if (!entry.id || entry.id !== toolCall.id) entry.id = toolCall.id
      }
      const fn = toolCall.function || toolCall
      if (fn?.name) entry.name = fn.name
      if (fn?.arguments != null) entry.args += parseToolArguments(fn.arguments)
      calls.set(index, entry)
    }
  }
  return { text, reasoning, done: choice.finish_reason === 'stop' }
}

function finalizeCalls(calls: Map<number, AccumulatedCall>): Array<{ id: string; name: string; args: string }> {
  return [...calls.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([index, call]) => ({
      id: call.id || `call_${Date.now().toString(36)}_${index}`,
      name: call.name,
      args: call.args || '{}',
    }))
    .filter((call) => call.name)
}

async function* streamOpenAI(req: StreamRequest): AsyncGenerator<StreamPart> {
  const { provider, model } = req
  const url = openAIUrl(provider, model)
  const body = buildBody(req)
  const res = await postJson(url, authHeaders(provider), body, req.signal)
  const contentType = res.headers.get('content-type') || ''

  // Some servers ignore stream:true and reply with a single JSON object.
  if (contentType.includes('application/json') && !contentType.includes('event-stream')) {
    const payload = safeJsonParse(await res.text())
    if (!payload) throw new Error('Provider returned an invalid JSON response')
    const message = payload.choices?.[0]?.message || {}
    if (message.content) yield { type: 'text', text: String(message.content) }
    if (Array.isArray(message.tool_calls)) {
      for (const [index, call] of message.tool_calls.entries()) {
        yield {
          type: 'tool_call',
          id: call.id || `call_${Date.now().toString(36)}_${index}`,
          name: call.function?.name || '',
          arguments: parseToolArguments(call.function?.arguments),
        }
      }
    }
    if (payload.usage) yield { type: 'usage', usage: normalizeUsage(payload.usage) }
    yield { type: 'done' }
    return
  }

  const calls = new Map<number, AccumulatedCall>()
  const usage: Usage = {}
  for await (const data of readSSE(res)) {
    const payload = safeJsonParse(data)
    if (!payload) continue
    const result = applyChunk(payload, calls, usage)
    if (result.text) yield { type: 'text', text: result.text }
    if (result.reasoning) yield { type: 'reasoning', text: result.reasoning }
  }
  for (const call of finalizeCalls(calls)) {
    yield { type: 'tool_call', id: call.id, name: call.name, arguments: call.args }
  }
  if (Object.keys(usage).length) yield { type: 'usage', usage }
  yield { type: 'done' }
}

/* ---------------------------------- Ollama ---------------------------------- */

function ollamaRoot(provider: Provider): string {
  return (provider.baseUrl || 'http://127.0.0.1:11434')
    .replace(/\/v1\/?$/i, '')
    .replace(/\/api\/?$/i, '')
    .replace(/\/+$/, '')
}

function toOllamaMessages(messages: ChatTurn[]): any[] {
  return messages.map((message) => {
    if (message.role === 'assistant' && message.toolCalls?.length) {
      return {
        role: 'assistant',
        content: message.content || '',
        tool_calls: message.toolCalls.map((call) => ({
          function: { name: call.name, arguments: safeJsonParse(call.arguments) || {} },
        })),
      }
    }
    if (message.role === 'tool') {
      return { role: 'tool', content: message.content, tool_name: message.name || '' }
    }
    return { role: message.role, content: message.content }
  })
}

async function* streamOllama(req: StreamRequest): AsyncGenerator<StreamPart> {
  const { provider, model } = req
  const body: Record<string, unknown> = {
    model,
    messages: toOllamaMessages(req.messages),
    stream: true,
  }
  if (typeof req.temperature === 'number') body.options = { temperature: req.temperature }
  if (req.tools.length && provider.config?.tools !== false) {
    body.tools = req.tools.map((tool) => ({
      type: 'function',
      function: { name: tool.name, description: tool.description, parameters: tool.parameters },
    }))
  }
  const res = await postJson(`${ollamaRoot(provider)}/api/chat`, authHeaders(provider), body, req.signal)
  const contentType = res.headers.get('content-type') || ''
  const usage: Usage = {}

  if (contentType.includes('application/json') && !contentType.includes('x-ndjson')) {
    const payload = safeJsonParse(await res.text())
    if (!payload) throw new Error('Ollama returned an invalid JSON response')
    const message = payload.message || {}
    if (message.content) yield { type: 'text', text: message.content }
    if (message.thinking) yield { type: 'reasoning', text: message.thinking }
    if (Array.isArray(message.tool_calls)) {
      for (const [index, call] of message.tool_calls.entries()) {
        yield {
          type: 'tool_call',
          id: `call_${Date.now().toString(36)}_${index}`,
          name: call.function?.name || '',
          arguments: parseToolArguments(call.function?.arguments),
        }
      }
    }
    yield { type: 'usage', usage: normalizeUsage(payload) }
    yield { type: 'done' }
    return
  }

  let index = 0
  for await (const line of readLinesCompat(res)) {
    const payload = safeJsonParse(line)
    if (!payload) continue
    if (payload.error) throw new Error(String(payload.error))
    const message = payload.message || {}
    if (message.content) yield { type: 'text', text: message.content }
    if (message.thinking) yield { type: 'reasoning', text: message.thinking }
    if (Array.isArray(message.tool_calls)) {
      for (const call of message.tool_calls) {
        yield {
          type: 'tool_call',
          id: `call_${Date.now().toString(36)}_${index++}`,
          name: call.function?.name || '',
          arguments: parseToolArguments(call.function?.arguments),
        }
      }
    }
    if (payload.done) Object.assign(usage, normalizeUsage(payload))
  }
  if (Object.keys(usage).length) yield { type: 'usage', usage }
  yield { type: 'done' }
}

async function* readLinesCompat(res: Response): AsyncGenerator<string> {
  const { readLines } = await import('./http.js')
  yield* readLines(res)
}

/* ---------------------------------- models ---------------------------------- */

async function listOpenAIModels(provider: Provider): Promise<string[]> {
  const base = providerBase(provider)
  const configured = provider.models || []
  if (provider.kind === 'ollama') {
    try {
      const data = await getJson(`${ollamaRoot(provider)}/api/tags`, authHeaders(provider))
      return (data.models || []).map((m: any) => String(m.name)).filter(Boolean)
    } catch {
      // fall through to OpenAI-compatible listing
    }
  }
  if (provider.kind === 'azure') {
    return configured.length ? configured : provider.defaultModel ? [provider.defaultModel] : []
  }
  try {
    const data = await getJson(`${ensureV1(base)}/models`, authHeaders(provider))
    const models = (data.data || data.models || [])
      .map((m: any) => (typeof m === 'string' ? m : m.id || m.name))
      .filter(Boolean)
    return models.length ? models : configured
  } catch (err) {
    if (configured.length) return configured
    throw err
  }
}

async function testOpenAI(provider: Provider): Promise<string> {
  const models = await listOpenAIModels(provider)
  if (!models.length) throw new Error('Connected, but the provider returned no models')
  return `Connected · ${models.length} model${models.length === 1 ? '' : 's'} available`
}

export const openaiAdapter: ProviderAdapter = {
  stream: streamOpenAI,
  listModels: listOpenAIModels,
  test: testOpenAI,
}

export const ollamaAdapter: ProviderAdapter = {
  stream: streamOllama,
  listModels: listOpenAIModels,
  test: async (provider) => {
    try {
      const data = await getJson(`${ollamaRoot(provider)}/api/version`, authHeaders(provider))
      return `Connected · Ollama ${data.version || 'ready'}`
    } catch {
      const models = await listOpenAIModels(provider)
      return `Connected · ${models.length} model${models.length === 1 ? '' : 's'} available`
    }
  },
}
