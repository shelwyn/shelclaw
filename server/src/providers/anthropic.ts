import type { Provider, Usage } from '../types.js'
import type { ChatTurn, ProviderAdapter, StreamPart, StreamRequest } from './types.js'
import { getJson, normalizeUsage, parseToolArguments, postJson, readSSE, safeJsonParse } from './http.js'

function anthropicBase(provider: Provider): string {
  return (provider.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '')
}

function anthropicUrl(provider: Provider): string {
  const config = provider.config || {}
  if (typeof config.chatPath === 'string' && config.chatPath) {
    return `${anthropicBase(provider)}/${String(config.chatPath).replace(/^\/+/, '')}`
  }
  const base = anthropicBase(provider)
  if (/\/v1$/i.test(base)) return `${base}/messages`
  return `${base}/v1/messages`
}

function headersFor(provider: Provider): Record<string, string> {
  const config = provider.config || {}
  return {
    'anthropic-version': String(config.version || '2023-06-01'),
    ...(provider.apiKey ? { 'x-api-key': provider.apiKey } : {}),
    ...((config.headers as Record<string, string>) || {}),
  }
}

interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: any[]
}

function toAnthropic(messages: ChatTurn[]): { system: string; messages: AnthropicMessage[] } {
  const systemParts: string[] = []
  const out: AnthropicMessage[] = []

  const push = (role: 'user' | 'assistant', blocks: any[]) => {
    if (!blocks.length) return
    const last = out[out.length - 1]
    if (last && last.role === role) {
      last.content.push(...blocks)
    } else {
      out.push({ role, content: blocks })
    }
  }

  for (const message of messages) {
    if (message.role === 'system') {
      if (message.content.trim()) systemParts.push(message.content.trim())
      continue
    }
    if (message.role === 'user') {
      push('user', [{ type: 'text', text: message.content || '(empty)' }])
      continue
    }
    if (message.role === 'assistant') {
      const blocks: any[] = []
      if (message.content) blocks.push({ type: 'text', text: message.content })
      for (const call of message.toolCalls || []) {
        let input: unknown = {}
        try {
          input = call.arguments ? JSON.parse(call.arguments) : {}
        } catch {
          input = { raw: call.arguments }
        }
        blocks.push({ type: 'tool_use', id: call.id, name: call.name, input })
      }
      push('assistant', blocks)
      continue
    }
    if (message.role === 'tool') {
      push('user', [
        {
          type: 'tool_result',
          tool_use_id: message.toolCallId || '',
          content: message.content || 'No output.',
        },
      ])
    }
  }

  return { system: systemParts.join('\n\n'), messages: out }
}

function buildBody(req: StreamRequest): Record<string, unknown> {
  const { system, messages } = toAnthropic(req.messages)
  const config = req.provider.config || {}
  const maxTokens = req.maxTokens ?? (typeof config.maxTokens === 'number' ? config.maxTokens : 4096)
  const body: Record<string, unknown> = {
    model: req.model,
    max_tokens: maxTokens,
    messages,
    stream: true,
  }
  if (system) body.system = system
  if (typeof req.temperature === 'number') body.temperature = req.temperature
  if (req.tools.length && config.tools !== false) {
    body.tools = req.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    }))
  }
  if (config.extraBody && typeof config.extraBody === 'object') {
    Object.assign(body, config.extraBody as Record<string, unknown>)
  }
  return body
}

async function* streamAnthropic(req: StreamRequest): AsyncGenerator<StreamPart> {
  const res = await postJson(anthropicUrl(req.provider), headersFor(req.provider), buildBody(req), req.signal)
  const contentType = res.headers.get('content-type') || ''

  if (contentType.includes('application/json') && !contentType.includes('event-stream')) {
    const payload = safeJsonParse(await res.text())
    if (!payload) throw new Error('Anthropic returned an invalid JSON response')
    if (payload.error) throw new Error(payload.error.message || JSON.stringify(payload.error))
    for (const block of payload.content || []) {
      if (block.type === 'text' && block.text) yield { type: 'text', text: block.text }
      if (block.type === 'tool_use') {
        yield {
          type: 'tool_call',
          id: block.id || `call_${Date.now().toString(36)}`,
          name: block.name,
          arguments: JSON.stringify(block.input || {}),
        }
      }
    }
    if (payload.usage) yield { type: 'usage', usage: normalizeUsage(payload.usage) }
    yield { type: 'done' }
    return
  }

  const toolBlocks = new Map<number, { id: string; name: string; args: string }>()
  const usage: Usage = {}

  for await (const data of readSSE(res)) {
    const payload = safeJsonParse(data)
    if (!payload) continue
    if (payload.type === 'error') {
      throw new Error(payload.error?.message || JSON.stringify(payload.error || payload))
    }
    if (payload.type === 'message_start') {
      const u = payload.message?.usage
      if (u) Object.assign(usage, normalizeUsage(u))
    }
    if (payload.type === 'content_block_start') {
      const block = payload.content_block
      if (block?.type === 'tool_use') {
        toolBlocks.set(payload.index, { id: block.id, name: block.name, args: '' })
      }
      if (block?.type === 'text' && block.text) yield { type: 'text', text: block.text }
    }
    if (payload.type === 'content_block_delta') {
      const delta = payload.delta || {}
      if (delta.type === 'text_delta' && delta.text) yield { type: 'text', text: delta.text }
      if (delta.type === 'thinking_delta' && delta.thinking) yield { type: 'reasoning', text: delta.thinking }
      if (delta.type === 'input_json_delta' && payload.index != null) {
        const entry = toolBlocks.get(payload.index)
        if (entry) entry.args += delta.partial_json || ''
      }
    }
    if (payload.type === 'content_block_stop' && payload.index != null) {
      const entry = toolBlocks.get(payload.index)
      if (entry?.name) {
        yield {
          type: 'tool_call',
          id: entry.id || `call_${Date.now().toString(36)}_${payload.index}`,
          name: entry.name,
          arguments: entry.args || '{}',
        }
        toolBlocks.delete(payload.index)
      }
    }
    if (payload.type === 'message_delta') {
      const u = payload.usage
      if (u) {
        const deltaUsage = normalizeUsage(u)
        usage.input = usage.input ?? deltaUsage.input
        usage.output = deltaUsage.output ?? usage.output
        usage.total = (usage.input || 0) + (usage.output || 0)
      }
    }
  }
  if (Object.keys(usage).length) yield { type: 'usage', usage }
  yield { type: 'done' }
}

async function listAnthropicModels(provider: Provider): Promise<string[]> {
  const configured = provider.models || []
  try {
    const url = `${anthropicBase(provider)}/v1/models?limit=100`
    const data = await getJson(url, headersFor(provider))
    const models = (data.data || []).map((m: any) => String(m.id)).filter(Boolean)
    return models.length ? models : configured
  } catch (err) {
    if (configured.length) return configured
    throw err
  }
}

export const anthropicAdapter: ProviderAdapter = {
  stream: streamAnthropic,
  listModels: listAnthropicModels,
  test: async (provider) => {
    const models = await listAnthropicModels(provider)
    if (!models.length) throw new Error('Connected, but no models were returned')
    return `Connected · ${models.length} model${models.length === 1 ? '' : 's'} available`
  },
}
