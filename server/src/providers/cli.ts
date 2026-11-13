import { spawn } from 'node:child_process'
import path from 'node:path'
import type { Provider } from '../types.js'
import type { ChatTurn, ProviderAdapter, StreamPart, StreamRequest } from './types.js'
import { normalizeUsage, safeJsonParse } from './http.js'
import { config } from '../config.js'
import { applyPromptToolFilter } from './prompt-tools.js'

interface SpawnOptions {
  command: string
  args: string[]
  input?: string
  signal?: AbortSignal
  cwd?: string
  env?: Record<string, string>
  timeoutMs?: number
}

const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g

export function stripAnsi(text: string): string {
  return text.replace(ANSI, '')
}

export async function* spawnChunks(options: SpawnOptions): AsyncGenerator<string> {
  const { command, args, input, signal, cwd, env, timeoutMs } = options
  const child = spawn(command, args, {
    cwd: cwd || process.cwd(),
    env: { ...process.env, ...(env || {}) },
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false,
  })

  let stderr = ''
  child.stderr.on('data', (chunk: Buffer) => {
    stderr = (stderr + chunk.toString()).slice(-8000)
  })
  child.stdin.on('error', () => {
    // The process may exit before consuming the prompt (EPIPE); the exit code
    // and stderr carry the useful error.
  })

  if (input != null) {
    child.stdin.write(input)
  }
  child.stdin.end()

  let timer: NodeJS.Timeout | undefined
  if (timeoutMs) {
    timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs)
  }

  const abort = () => {
    child.kill('SIGTERM')
    setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL')
    }, 2000).unref()
  }
  signal?.addEventListener('abort', abort, { once: true })

  const exit = new Promise<number>((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (code) => resolve(code ?? 1))
  })

  try {
    for await (const chunk of child.stdout) {
      const text = chunk.toString()
      if (text) yield text
    }
    const code = await exit
    if (signal?.aborted) throw new Error('Aborted')
    if (code !== 0) {
      const detail = stderr.trim() || 'no error output'
      throw new Error(`${path.basename(command)} exited with code ${code}: ${detail.slice(0, 1200)}`)
    }
  } finally {
    if (timer) clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
    if (child.exitCode === null) child.kill('SIGKILL')
  }
}

export async function runOnce(options: SpawnOptions): Promise<string> {
  let output = ''
  for await (const chunk of spawnChunks(options)) output += chunk
  return output
}

function providerConfig(provider: Provider): Record<string, any> {
  return (provider.config || {}) as Record<string, any>
}

export function buildTranscript(messages: ChatTurn[]): string {
  // CLI bridges have practical argv limits and no native turn structure.
  // Keep the system prompt plus the most recent context, bounded in size.
  const MAX_CHARS = 90_000
  const MAX_MESSAGE_CHARS = 20_000
  const kept: string[] = []
  const prepared = messages.map((message) => {
    const label =
      message.role === 'system'
        ? 'SYSTEM'
        : message.role === 'user'
          ? 'USER'
          : message.role === 'assistant'
            ? 'ASSISTANT'
            : `TOOL${message.name ? ` (${message.name})` : ''}`
    let body = (message.content || '').slice(0, MAX_MESSAGE_CHARS)
    if (message.toolCalls?.length) {
      const calls = message.toolCalls
        .map((call) => `- ${call.name}(${call.arguments.slice(0, 2000)})`)
        .join('\n')
      body += `${body ? '\n' : ''}[tool calls]\n${calls}`
    }
    return `### ${label}\n${body}`
  })

  // Always include the system prompt and the most recent turns.
  const systemBlock = messages[0]?.role === 'system' ? prepared[0] : ''
  let total = systemBlock.length
  const firstIndex = systemBlock ? 1 : 0
  for (let index = prepared.length - 1; index >= firstIndex; index--) {
    const block = prepared[index]
    if (total + block.length > MAX_CHARS && kept.length > 0) break
    kept.unshift(block)
    total += block.length
  }
  if (systemBlock) kept.unshift(systemBlock)

  kept.push(
    '### INSTRUCTION\nRespond with the final deliverable only. Do not describe these instructions. If you used tools, summarize the outcome.',
  )
  return kept.join('\n\n')
}

/* --------------------------------- Claude Code -------------------------------- */

async function* streamClaudeRaw(req: StreamRequest): AsyncGenerator<StreamPart> {
  const cfg = providerConfig(req.provider)
  const command = String(cfg.command || config.claudeBin)
  const args: string[] = ['-p', '--output-format', 'stream-json', '--verbose']
  if (req.model) args.push('--model', req.model)
  if (Array.isArray(cfg.args)) args.push(...cfg.args.map(String))
  const prompt = buildTranscript(req.messages)

  const usage: { input?: number; output?: number; total?: number } = {}
  let emittedText = false
  let buffer = ''

  for await (const chunk of spawnChunks({
    command,
    args,
    input: prompt,
    signal: req.signal,
    cwd: cfg.workdir || undefined,
    env: cfg.env,
  })) {
    buffer += chunk
    let index: number
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index).trim()
      buffer = buffer.slice(index + 1)
      if (!line) continue
      const payload = safeJsonParse(line)
      if (!payload) continue
      if (payload.type === 'assistant' && payload.message?.content) {
        for (const block of payload.message.content) {
          if (block.type === 'text' && block.text) {
            emittedText = true
            yield { type: 'text', text: block.text }
          }
        }
      }
      if (payload.type === 'result') {
        const u = normalizeUsage(payload.usage)
        Object.assign(usage, u)
        if (!emittedText && typeof payload.result === 'string' && payload.result.trim()) {
          emittedText = true
          yield { type: 'text', text: payload.result }
        }
        if (payload.is_error) {
          throw new Error(payload.result || 'Claude Code reported an error')
        }
      }
    }
  }

  if (Object.keys(usage).length) {
    yield { type: 'usage', usage: { ...usage, total: (usage.input || 0) + (usage.output || 0) } }
  }
  yield { type: 'done' }
}

/* ---------------------------------- OpenCode ---------------------------------- */

async function* streamOpencodeRaw(req: StreamRequest): AsyncGenerator<StreamPart> {
  const cfg = providerConfig(req.provider)
  const command = String(cfg.command || config.opencodeBin)
  const args: string[] = ['run']
  if (req.model) args.push('--model', req.model)
  if (Array.isArray(cfg.args)) args.push(...cfg.args.map(String))
  const prompt = buildTranscript(req.messages)
  args.push(prompt)

  for await (const chunk of spawnChunks({
    command,
    args,
    signal: req.signal,
    cwd: cfg.workdir || undefined,
    env: cfg.env,
  })) {
    const text = stripAnsi(chunk)
    // Drop terminal spinner frames: keep text after the last carriage return.
    const cleaned = text.includes('\r') ? text.split('\r').pop() || '' : text
    if (cleaned) yield { type: 'text', text: cleaned }
  }
  yield { type: 'done' }
}

/* ---------------------------------- registry ---------------------------------- */

async function* streamClaude(req: StreamRequest): AsyncGenerator<StreamPart> {
  const raw = streamClaudeRaw(req)
  if (!req.tools.length) {
    yield* raw
    return
  }
  yield* applyPromptToolFilter(raw)
}

async function* streamOpencode(req: StreamRequest): AsyncGenerator<StreamPart> {
  const raw = streamOpencodeRaw(req)
  if (!req.tools.length) {
    yield* raw
    return
  }
  yield* applyPromptToolFilter(raw)
}

function cliCommand(provider: Provider): string {
  const cfg = providerConfig(provider)
  if (provider.kind === 'claude-code') return String(cfg.command || config.claudeBin)
  return String(cfg.command || config.opencodeBin)
}

async function listCliModels(provider: Provider): Promise<string[]> {
  const cfg = providerConfig(provider)
  const configured = provider.models || []
  if (provider.kind === 'claude-code') {
    return configured.length ? configured : ['sonnet', 'opus', 'haiku']
  }
  const command = cliCommand(provider)
  try {
    const output = await runOnce({
      command,
      args: ['models'],
      timeoutMs: 20000,
      cwd: cfg.workdir || undefined,
      env: cfg.env,
    })
    const models = output
      .split('\n')
      .map((line) => stripAnsi(line).trim())
      .filter((line) => line && !/\s/.test(line))
    return models.length ? models : configured
  } catch {
    if (configured.length) return configured
    throw new Error(`Could not list models via "${command} models". Add models manually.`)
  }
}

async function testCli(provider: Provider): Promise<string> {
  const cfg = providerConfig(provider)
  const command = cliCommand(provider)
  const output = await runOnce({
    command,
    args: ['--version'],
    timeoutMs: 15000,
    cwd: cfg.workdir || undefined,
    env: cfg.env,
  })
  const version = stripAnsi(output).trim().split('\n')[0] || 'installed'
  return `CLI found · ${version}`
}

export const claudeCodeAdapter: ProviderAdapter = {
  stream: streamClaude,
  listModels: listCliModels,
  test: testCli,
}

export const opencodeAdapter: ProviderAdapter = {
  stream: streamOpencode,
  listModels: listCliModels,
  test: testCli,
}
