import { sleep } from '../util.js'
import type { Usage } from '../types.js'

export function joinUrl(base: string, path: string): string {
  const cleanBase = base.replace(/\/+$/, '')
  const cleanPath = path.replace(/^\/+/, '')
  return `${cleanBase}/${cleanPath}`
}

export function ensureV1(base: string): string {
  const clean = base.replace(/\/+$/, '')
  if (/\/(v1|openai\/v1|api\/v1)$/i.test(clean)) return clean
  return `${clean}/v1`
}

export function trimSnippet(text: string, length = 600): string {
  return text.length > length ? `${text.slice(0, length)}…` : text
}

export async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  signal: AbortSignal | undefined,
  opts: { retries?: number; fetchImpl?: typeof fetch } = {},
): Promise<Response> {
  const retries = opts.retries ?? 2
  const doFetch = opts.fetchImpl ?? fetch
  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted) throw new Error('Aborted')
    try {
      const res = await doFetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal,
      })
      if (res.ok) return res
      const text = trimSnippet(await res.text().catch(() => ''))
      const retryable = res.status === 429 || res.status >= 500
      if (retryable && attempt < retries) {
        await sleep(600 * 2 ** attempt, signal)
        continue
      }
      throw new Error(`HTTP ${res.status} from ${hostOf(url)}: ${text || res.statusText}`)
    } catch (err) {
      if (signal?.aborted) throw new Error('Aborted')
      lastError = err
      const msg = err instanceof Error ? err.message : String(err)
      const retryable = /fetch failed|ECONNRESET|ETIMEDOUT|network|socket/i.test(msg)
      if (retryable && attempt < retries) {
        await sleep(600 * 2 ** attempt, signal)
        continue
      }
      throw err
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

export async function getJson(
  url: string,
  headers: Record<string, string>,
  signal?: AbortSignal,
): Promise<any> {
  const res = await fetch(url, { headers, signal })
  if (!res.ok) {
    const text = trimSnippet(await res.text().catch(() => ''))
    throw new Error(`HTTP ${res.status} from ${hostOf(url)}: ${text || res.statusText}`)
  }
  return res.json()
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/**
 * Read a byte stream line-by-line. Works for both SSE and NDJSON payloads.
 */
export async function* readLines(res: Response): AsyncGenerator<string> {
  if (!res.body) return
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let index: number
      while ((index = buffer.indexOf('\n')) >= 0) {
        let line = buffer.slice(0, index)
        buffer = buffer.slice(index + 1)
        if (line.endsWith('\r')) line = line.slice(0, -1)
        if (line.length) yield line
      }
    }
    buffer += decoder.decode()
    if (buffer.trim()) yield buffer
  } finally {
    reader.releaseLock()
  }
}

export async function* readSSE(res: Response): AsyncGenerator<string> {
  for await (const line of readLines(res)) {
    if (!line.startsWith('data:')) continue
    const data = line.slice(5).trim()
    if (!data) continue
    if (data === '[DONE]') return
    yield data
  }
}

export function mergeUsage(target: Usage, input?: number, output?: number): Usage {
  const usage = { ...target }
  if (typeof input === 'number') usage.input = (usage.input || 0) + input
  if (typeof output === 'number') usage.output = (usage.output || 0) + output
  usage.total = (usage.input || 0) + (usage.output || 0)
  return usage
}

export function normalizeUsage(raw: any): Usage {
  if (!raw || typeof raw !== 'object') return {}
  const input =
    raw.prompt_tokens ?? raw.input_tokens ?? raw.prompt_eval_count ?? raw.inputTokens ?? undefined
  const output =
    raw.completion_tokens ?? raw.output_tokens ?? raw.eval_count ?? raw.outputTokens ?? undefined
  const total = raw.total_tokens ?? raw.totalTokens ?? undefined
  const usage: Usage = {}
  if (typeof input === 'number') usage.input = input
  if (typeof output === 'number') usage.output = output
  if (typeof total === 'number') usage.total = total
  else if (usage.input != null || usage.output != null) usage.total = (usage.input || 0) + (usage.output || 0)
  return usage
}

export function safeJsonParse(value: string): any {
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

export function parseToolArguments(value: unknown): string {
  if (typeof value === 'string') return value
  if (value == null) return '{}'
  try {
    return JSON.stringify(value)
  } catch {
    return '{}'
  }
}
