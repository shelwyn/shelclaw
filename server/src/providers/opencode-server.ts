import type { Provider, Usage } from '../types.js'
import type { ChatTurn, ProviderAdapter, StreamPart, StreamRequest } from './types.js'
import { readSSE, safeJsonParse } from './http.js'
import { applyPromptToolFilter } from './prompt-tools.js'

/**
 * OpenCode v2 server adapter.
 *
 * Start the server with:
 *   opencode serve --hostname 0.0.0.0 --port 4096
 * It prints `server password <generated>`. The API uses HTTP Basic auth with
 * username `opencode` and that password. A fixed password can be supplied with
 * the OPENCODE_PASSWORD environment variable.
 */

interface BaseInfo {
  root: string
  password: string
}

function serverBase(provider: Provider): BaseInfo {
  const raw = (provider.baseUrl || '').trim()
  if (!raw) throw new Error('OpenCode server URL is missing. Example: http://127.0.0.1:4096')
  let password = (provider.apiKey || '').trim()
  let root = raw.replace(/\/+$/, '')
  try {
    const url = new URL(raw)
    if (!password && url.password) password = decodeURIComponent(url.password).trim()
    if (url.hostname === '0.0.0.0' || url.hostname === '::' || url.hostname === '[::]') {
      url.hostname = '127.0.0.1'
    }
    url.username = ''
    url.password = ''
    url.search = ''
    url.hash = ''
    root = url.toString().replace(/\/+$/, '')
  } catch {
    throw new Error('OpenCode server URL must include http:// or https:// and a port.')
  }
  root = root.replace(/\/api$/i, '')
  return { root, password }
}

function authHeaders(base: BaseInfo): Record<string, string> {
  if (!base.password) return {}
  const basic = Buffer.from(`opencode:${base.password}`, 'utf8').toString('base64')
  return { authorization: `Basic ${basic}` }
}

async function ocFetch(
  base: BaseInfo,
  path: string,
  init: RequestInit = {},
  signal?: AbortSignal,
): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('accept', headers.get('accept') || 'application/json')
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json')
  for (const [key, value] of Object.entries(authHeaders(base))) headers.set(key, value)
  let res: Response
  try {
    res = await fetch(`${base.root}${path}`, { ...init, headers, signal })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err
    throw new Error(
      `Could not reach OpenCode at ${base.root}. Use the full http(s) link with port (for example http://127.0.0.1:4096) and make sure \`opencode serve\` is running.`,
    )
  }
  if (!res.ok) {
    const text = (await res.text().catch(() => '')).slice(0, 800)
    if (res.status === 401) {
      throw new Error(
        'OpenCode rejected the password (401). Paste the password printed by `opencode serve` — it changes when the server restarts unless you set OPENCODE_PASSWORD.',
      )
    }
    throw new Error(`OpenCode ${res.status}: ${text || res.statusText}`)
  }
  return res
}

async function ocJson<T = any>(
  base: BaseInfo,
  path: string,
  init: RequestInit = {},
  signal?: AbortSignal,
): Promise<T> {
  const res = await ocFetch(base, path, init, signal)
  return (await res.json()) as T
}

interface OcModel {
  id: string
  modelID?: string
  providerID: string
  name?: string
  enabled?: boolean
  status?: string
}

async function fetchModels(base: BaseInfo): Promise<OcModel[]> {
  const payload = await ocJson<{ data?: OcModel[] }>(base, '/api/model')
  return (payload.data || []).filter(
    (model) => model && model.providerID && (model.modelID || model.id),
  )
}

function modelKey(model: OcModel): string {
  return `${model.providerID}/${model.modelID || model.id}`
}

function resolveModelRef(
  models: OcModel[],
  raw: string,
): { providerID: string; modelID: string } | undefined {
  const value = raw.trim()
  if (!value) return undefined
  const slash = value.indexOf('/')
  if (slash > 0) {
    return { providerID: value.slice(0, slash), modelID: value.slice(slash + 1) }
  }
  const match = models.find((model) => (model.modelID || model.id) === value)
  if (match) return { providerID: match.providerID, modelID: match.modelID || match.id }
  return undefined
}

function buildPrompt(messages: ChatTurn[]): string {
  const MAX_CHARS = 90_000
  const kept: string[] = []
  let total = 0

  const prepared = messages
    .filter((message) => message.role !== 'system' || message.content.trim())
    .map((message) => {
      const label =
        message.role === 'system'
          ? 'SYSTEM'
          : message.role === 'user'
            ? 'USER'
            : message.role === 'assistant'
              ? 'ASSISTANT'
              : `TOOL${message.name ? ` (${message.name})` : ''}`
      let body = (message.content || '').slice(0, 20_000)
      if (message.toolCalls?.length) {
        body += `${body ? '\n' : ''}[tool calls]\n${message.toolCalls
          .map((call) => `- ${call.name}(${call.arguments.slice(0, 2000)})`)
          .join('\n')}`
      }
      return `### ${label}\n${body}`
    })

  const system = messages[0]?.role === 'system' ? prepared[0] : ''
  const first = system ? 1 : 0
  total = system.length
  for (let index = prepared.length - 1; index >= first; index--) {
    const block = prepared[index]
    if (total + block.length > MAX_CHARS && kept.length > 0) break
    kept.unshift(block)
    total += block.length
  }
  if (system) kept.unshift(system)

  kept.push(
    '### INSTRUCTION\nYou are running as a delegated agent inside Shelclaw. Use the brief above and return a self-contained final deliverable. Do not describe these instructions.',
  )
  return kept.join('\n\n')
}

function lastUserText(messages: ChatTurn[]): string {
  const user = [...messages].reverse().find((message) => message.role === 'user')
  return (user?.content || '').replace(/\s+/g, ' ').trim()
}

function errorText(payload: any): string {
  if (!payload) return 'Unknown OpenCode error'
  if (typeof payload === 'string') return payload
  if (payload.error) return typeof payload.error === 'string' ? payload.error : JSON.stringify(payload.error)
  if (payload.message) return String(payload.message)
  try {
    return JSON.stringify(payload).slice(0, 600)
  } catch {
    return 'Unknown OpenCode error'
  }
}

async function interruptSession(base: BaseInfo, sessionID: string): Promise<void> {
  try {
    await ocFetch(base, `/api/session/${encodeURIComponent(sessionID)}/interrupt`, { method: 'POST' })
  } catch {
    // best effort on cancellation
  }
}

async function finalText(base: BaseInfo, sessionID: string): Promise<string> {
  try {
    const payload = await ocJson<{ data?: any[] }>(
      base,
      `/api/session/${encodeURIComponent(sessionID)}/message?limit=20`,
    )
    for (const message of payload.data || []) {
      if (message.type !== 'assistant' || !Array.isArray(message.content)) continue
      const text = message.content
        .filter((block: any) => block?.type === 'text' && typeof block.text === 'string')
        .map((block: any) => block.text)
        .join('')
      if (text.trim()) return text
    }
  } catch {
    // fall through
  }
  return ''
}

async function* streamOpenCodeRaw(req: StreamRequest): AsyncGenerator<StreamPart> {
  const provider = req.provider
  const config = (provider.config || {}) as Record<string, any>
  const base = serverBase(provider)
  if (!base.password) {
    throw new Error(
      'OpenCode server password is missing. Copy the password printed by `opencode serve` into the provider settings.',
    )
  }

  let models: OcModel[] = []
  try {
    models = await fetchModels(base)
  } catch {
    // /api/model may be unavailable; the server may still accept a model name.
  }

  const ref = resolveModelRef(models, req.model)
  const agent = typeof config.agent === 'string' && config.agent ? config.agent : 'build'
  const variant = typeof config.variant === 'string' && config.variant ? config.variant : 'default'
  const workdir = typeof config.workdir === 'string' && config.workdir ? config.workdir : ''
  const promptText = buildPrompt(req.messages)
  const title = `Shelclaw · ${lastUserText(req.messages).slice(0, 70) || 'delegated task'}`

  const sessionBody: Record<string, unknown> = { title, agent }
  if (ref) sessionBody.model = { providerID: ref.providerID, id: ref.modelID, variant }
  if (workdir) sessionBody.location = { directory: workdir }
  if (config.autoApprove === true) {
    sessionBody.permissions = [{ action: '*', resource: '*', effect: 'allow' }]
  } else if (Array.isArray(config.permissions)) {
    sessionBody.permissions = config.permissions
  }

  const created = await ocJson<{ data?: { id?: string } }>(base, '/api/session', {
    method: 'POST',
    body: JSON.stringify(sessionBody),
  }, req.signal)
  const sessionID = created.data?.id
  if (!sessionID) throw new Error('OpenCode did not return a session id.')

  const onAbort = () => {
    void interruptSession(base, sessionID)
  }
  req.signal?.addEventListener('abort', onAbort, { once: true })

  const sseRes = await ocFetch(
    base,
    '/api/event',
    { headers: { accept: 'text/event-stream' }, signal: req.signal },
    req.signal,
  )

  const usage: Usage = {}
  let emitted = ''
  let completed = false

  try {
    await ocFetch(
      base,
      `/api/session/${encodeURIComponent(sessionID)}/prompt`,
      { method: 'POST', body: JSON.stringify({ text: promptText }) },
      req.signal,
    )

    for await (const data of readSSE(sseRes)) {
      const event = safeJsonParse(data)
      if (!event?.type) continue
      const payload = event.data || {}
      if (payload.sessionID && payload.sessionID !== sessionID) continue

      if (event.type === 'session.text.delta') {
        if (typeof payload.delta === 'string' && payload.delta) {
          emitted += payload.delta
          yield { type: 'text', text: payload.delta }
        }
        continue
      }
      if (event.type === 'session.reasoning.delta') {
        if (typeof payload.delta === 'string' && payload.delta) {
          yield { type: 'reasoning', text: payload.delta }
        }
        continue
      }
      if (event.type === 'session.step.ended') {
        const tokens = payload.tokens || {}
        usage.input = (usage.input || 0) + (Number(tokens.input) || 0)
        usage.output = (usage.output || 0) + (Number(tokens.output) || 0)
        usage.cost = (usage.cost || 0) + (Number(payload.cost) || 0)
        usage.total = (usage.input || 0) + (usage.output || 0)
        continue
      }
      if (event.type === 'session.execution.succeeded') {
        completed = true
        break
      }
      if (event.type === 'session.execution.failed' || event.type === 'session.step.failed') {
        throw new Error(`OpenCode run failed: ${errorText(payload)}`)
      }
      if (event.type === 'session.execution.interrupted') {
        throw new Error('OpenCode run was interrupted.')
      }
    }
  } finally {
    req.signal?.removeEventListener('abort', onAbort)
    try {
      await sseRes.body?.cancel()
    } catch {
      // ignore
    }
  }

  if (req.signal?.aborted) throw new Error('Aborted')
  if (!completed) {
    throw new Error('OpenCode closed the event stream before the run completed.')
  }

  if (!emitted.trim()) {
    const fallback = await finalText(base, sessionID)
    if (fallback) {
      emitted = fallback
      yield { type: 'text', text: fallback }
    }
  }

  if (Object.keys(usage).length) yield { type: 'usage', usage }
  yield { type: 'done' }
}

async function* streamOpenCode(req: StreamRequest): AsyncGenerator<StreamPart> {
  const raw = streamOpenCodeRaw(req)
  if (!req.tools.length) {
    yield* raw
    return
  }
  yield* applyPromptToolFilter(raw)
}

async function listOpenCodeModels(provider: Provider): Promise<string[]> {
  const base = serverBase(provider)
  const models = await fetchModels(base)
  const keys = models
    .filter((model) => model.enabled !== false && model.status !== 'disabled')
    .map(modelKey)
  const unique = [...new Set(keys)].sort((a, b) => a.localeCompare(b))
  return unique.length ? unique : provider.models
}

async function testOpenCode(provider: Provider): Promise<string> {
  const base = serverBase(provider)
  const info = await ocJson<{ version?: string; urls?: string[] }>(base, '/api/info')
  let modelCount = 0
  try {
    modelCount = (await fetchModels(base)).length
  } catch {
    // info succeeded, model listing is optional
  }
  return `Connected · OpenCode ${info.version || 'server'}${
    modelCount ? ` · ${modelCount} models` : ''
  }`
}

export const opencodeServerAdapter: ProviderAdapter = {
  stream: streamOpenCode,
  listModels: listOpenCodeModels,
  test: testOpenCode,
}
