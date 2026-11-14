import { spawn } from 'node:child_process'
import type { McpServerInternal, McpToolSummary } from './types.js'

interface JsonRpcError {
  code?: number
  message?: string
}

interface JsonRpcResponse {
  id?: number | string
  result?: unknown
  error?: JsonRpcError
}

interface McpTool {
  name: string
  description?: string
  inputSchema?: unknown
}

const PROTOCOL_VERSION = '2024-11-05'
const REQUEST_TIMEOUT_MS = 15_000

function scrub(message: string, secretValues: string[]): string {
  let output = message
  for (const value of secretValues) {
    if (value && value.length >= 4) output = output.split(value).join('***')
  }
  return output.slice(0, 2_000)
}

function secretValues(server: McpServerInternal): string[] {
  return [...Object.values(server.env), ...Object.values(server.headers)].filter(Boolean)
}

function parseResponseMessage(text: string): JsonRpcResponse | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed) as JsonRpcResponse
  } catch {
    return null
  }
}

function extractTools(result: unknown): McpTool[] {
  if (!result || typeof result !== 'object') return []
  const tools = (result as { tools?: unknown }).tools
  if (!Array.isArray(tools)) return []
  return tools
    .filter((tool): tool is Record<string, unknown> => Boolean(tool) && typeof tool === 'object')
    .map((tool) => ({
      name: String(tool.name || '').trim(),
      description: String(tool.description || '').trim(),
      inputSchema: tool.inputSchema,
    }))
    .filter((tool) => tool.name)
}

async function withStdioServer<T>(
  server: McpServerInternal,
  fn: (client: {
    request: (method: string, params?: unknown) => Promise<unknown>
    notify: (method: string, params?: unknown) => Promise<void>
  }) => Promise<T>,
): Promise<T> {
  if (!server.command.trim()) throw new Error('This MCP server has no command configured.')
  const child = spawn(server.command, server.args, {
    env: { ...process.env, ...server.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  let buffer = ''
  let nextId = 1
  let stderr = ''
  const pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }
  >()

  const failAll = (message: string) => {
    for (const entry of pending.values()) {
      clearTimeout(entry.timer)
      entry.reject(new Error(scrub(message, secretValues(server))))
    }
    pending.clear()
  }

  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => {
    buffer += chunk
    let newline = buffer.indexOf('\n')
    while (newline >= 0) {
      const line = buffer.slice(0, newline).replace(/\r$/, '')
      buffer = buffer.slice(newline + 1)
      const message = parseResponseMessage(line)
      if (message && typeof message.id === 'number') {
        const entry = pending.get(message.id)
        if (entry) {
          clearTimeout(entry.timer)
          pending.delete(message.id)
          if (message.error) {
            entry.reject(
              new Error(scrub(message.error.message || 'MCP request failed.', secretValues(server))),
            )
          } else {
            entry.resolve(message.result)
          }
        }
      }
      newline = buffer.indexOf('\n')
    }
  })
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk: string) => {
    stderr = `${stderr}${chunk}`.slice(-4_000)
  })
  child.on('error', (error) => {
    failAll(`Could not start the MCP server: ${error.message}`)
  })
  child.on('exit', (code) => {
    failAll(
      `The MCP server exited${code == null ? '' : ` (code ${code})`}${
        stderr.trim() ? `: ${stderr.trim().slice(-500)}` : '.'
      }`,
    )
  })

  const write = (payload: unknown) =>
    new Promise<void>((resolve, reject) => {
      if (!child.stdin.writable) {
        reject(new Error('The MCP server input stream is closed.'))
        return
      }
      child.stdin.write(`${JSON.stringify(payload)}\n`, (error) => {
        if (error) reject(new Error(scrub(error.message, secretValues(server))))
        else resolve()
      })
    })

  const request = (method: string, params?: unknown) =>
    new Promise<unknown>((resolve, reject) => {
      const requestId = nextId++
      const timer = setTimeout(() => {
        pending.delete(requestId)
        reject(new Error(`MCP request timed out: ${method}`))
      }, REQUEST_TIMEOUT_MS)
      pending.set(requestId, { resolve, reject, timer })
      void write({ jsonrpc: '2.0', id: requestId, method, params }).catch((error) => {
        clearTimeout(timer)
        pending.delete(requestId)
        reject(error)
      })
    })

  const notify = (method: string, params?: unknown) => write({ jsonrpc: '2.0', method, params })

  try {
    await request('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'OpenCodex', version: '0.1.0' },
    })
    await notify('notifications/initialized')
    return await fn({ request, notify })
  } finally {
    try {
      child.stdin.end()
    } catch {
      // ignore
    }
    child.kill()
  }
}

function findSseResponse(text: string, requestId: number): JsonRpcResponse | null {
  for (const block of text.split(/\n\n/)) {
    const data = block
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('')
    if (!data) continue
    const message = parseResponseMessage(data)
    if (message && message.id === requestId) return message
  }
  return null
}

async function withHttpServer<T>(
  server: McpServerInternal,
  fn: (client: {
    request: (method: string, params?: unknown) => Promise<unknown>
    notify: (method: string, params?: unknown) => Promise<void>
  }) => Promise<T>,
): Promise<T> {
  if (!/^https?:\/\//i.test(server.url)) {
    throw new Error('Enter a valid http:// or https:// MCP server URL.')
  }
  let sessionId = ''
  let nextId = 1

  const post = async (payload: unknown): Promise<Response> => {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...server.headers,
    }
    if (sessionId) headers['mcp-session-id'] = sessionId
    const res = await fetch(server.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    const nextSession = res.headers.get('mcp-session-id')
    if (nextSession) sessionId = nextSession
    return res
  }

  const request = async (method: string, params?: unknown): Promise<unknown> => {
    const requestId = nextId++
    const res = await post({ jsonrpc: '2.0', id: requestId, method, params })
    if (!res.ok) {
      throw new Error(`MCP server returned HTTP ${res.status}.`)
    }
    const text = await res.text()
    const contentType = res.headers.get('content-type') || ''
    const message = contentType.includes('text/event-stream')
      ? findSseResponse(text, requestId)
      : parseResponseMessage(text)
    if (!message) throw new Error('MCP server returned an unreadable response.')
    if (message.error) {
      throw new Error(scrub(message.error.message || 'MCP request failed.', secretValues(server)))
    }
    return message.result
  }

  const notify = async (method: string, params?: unknown): Promise<void> => {
    const res = await post({ jsonrpc: '2.0', method, params })
    if (!res.ok) throw new Error(`MCP server returned HTTP ${res.status}.`)
    await res.text()
  }

  await request('initialize', {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: 'OpenCodex', version: '0.1.0' },
  })
  await notify('notifications/initialized')
  return fn({ request, notify })
}

function withServer<T>(
  server: McpServerInternal,
  fn: (client: {
    request: (method: string, params?: unknown) => Promise<unknown>
    notify: (method: string, params?: unknown) => Promise<void>
  }) => Promise<T>,
): Promise<T> {
  return server.transport === 'http' ? withHttpServer(server, fn) : withStdioServer(server, fn)
}

export async function listMcpTools(server: McpServerInternal): Promise<McpTool[]> {
  return withServer(server, async (client) => extractTools(await client.request('tools/list')))
}

export async function callMcpTool(
  server: McpServerInternal,
  toolName: string,
  args: Record<string, unknown>,
): Promise<string> {
  return withServer(server, async (client) => {
    const result = await client.request('tools/call', { name: toolName, arguments: args })
    if (!result || typeof result !== 'object') return ''
    const record = result as Record<string, unknown>
    const content = Array.isArray(record.content) ? record.content : []
    const parts: string[] = []
    for (const item of content) {
      if (!item || typeof item !== 'object') continue
      const entry = item as Record<string, unknown>
      if (entry.type === 'text' && typeof entry.text === 'string') parts.push(entry.text)
      else if (entry.type === 'image') parts.push('[image content]')
      else if (entry.type === 'resource') parts.push('[resource content]')
    }
    if (!parts.length && record.structuredContent) {
      parts.push(JSON.stringify(record.structuredContent, null, 2))
    }
    const text = parts.join('\n').trim()
    return record.isError ? `MCP tool error: ${text || 'unknown error'}` : text
  })
}

export async function mcpToolSummaries(
  server: McpServerInternal,
): Promise<McpToolSummary[]> {
  const tools = await listMcpTools(server)
  return tools.map((tool) => ({
    serverId: server.id,
    serverName: server.name,
    name: tool.name,
    description: tool.description || '',
    inputSchema: tool.inputSchema,
  }))
}

/** Return a loggable/displayable error with every configured credential value removed. */
export function sanitizeMcpError(server: McpServerInternal, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return scrub(message, secretValues(server))
}

interface CatalogCacheEntry {
  fingerprint: string
  at: number
  tools: McpToolSummary[]
  error: string
}

const catalogCache = new Map<string, CatalogCacheEntry>()
const CATALOG_TTL_MS = 60_000

export async function getMcpToolCatalog(
  servers: McpServerInternal[],
): Promise<McpToolSummary[]> {
  const enabled = servers.filter((server) => server.enabled)
  if (!enabled.length) return []
  const summaries = await Promise.all(
    enabled.map(async (server) => {
      const fingerprint = `${server.updatedAt}:${server.transport}:${server.command}:${server.url}`
      const cached = catalogCache.get(server.id)
      if (cached && cached.fingerprint === fingerprint && Date.now() - cached.at < CATALOG_TTL_MS) {
        return cached.tools
      }
      try {
        const tools = await mcpToolSummaries(server)
        catalogCache.set(server.id, {
          fingerprint,
          at: Date.now(),
          tools,
          error: '',
        })
        return tools
      } catch (err) {
        catalogCache.set(server.id, {
          fingerprint,
          at: Date.now(),
          tools: [],
          error: sanitizeMcpError(server, err),
        })
        return []
      }
    }),
  )
  return summaries.flat()
}

export function getMcpCatalogErrors(servers: McpServerInternal[]): string[] {
  return servers
    .filter((server) => server.enabled)
    .map((server) => catalogCache.get(server.id)?.error || '')
    .filter(Boolean)
}
