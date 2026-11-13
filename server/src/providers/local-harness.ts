import type { Provider } from '../types.js'
import type { ProviderAdapter, StreamPart, StreamRequest } from './types.js'
import { buildTranscript, runOnce, spawnChunks, stripAnsi } from './cli.js'
import { applyPromptToolFilter } from './prompt-tools.js'

/**
 * Generic local agent harness.
 *
 * Runs an executable on the server host and streams its stdout. This covers
 * harnesses such as Pi, or any custom local coding agent, without needing a
 * network API.
 *
 * Config:
 *   command      executable (e.g. "pi")
 *   args         string[] passed before the prompt
 *   promptMode   "arg" (default) or "stdin"
 *   modelFlag    optional flag used to pass the selected model, e.g. "--model"
 *   workdir      optional working directory
 *   env          optional environment variables
 */

function config(provider: Provider): Record<string, any> {
  return (provider.config || {}) as Record<string, any>
}

async function* streamLocalRaw(req: StreamRequest): AsyncGenerator<StreamPart> {
  const cfg = config(req.provider)
  const command = String(cfg.command || '').trim()
  if (!command) {
    throw new Error(
      'Local harness command is missing. Set the executable (for example `pi`) in the harness settings.',
    )
  }

  const args = Array.isArray(cfg.args) ? cfg.args.map(String) : []
  const modelFlag = typeof cfg.modelFlag === 'string' ? cfg.modelFlag.trim() : ''
  if (modelFlag && req.model) args.push(modelFlag, req.model)

  const promptMode = cfg.promptMode === 'stdin' ? 'stdin' : 'arg'
  const prompt = buildTranscript(req.messages)
  if (promptMode === 'arg') {
    if (prompt.length > 120_000) {
      throw new Error('Prompt is too large for argument-based local harnesses. Use stdin mode instead.')
    }
    args.push(prompt)
  }

  for await (const chunk of spawnChunks({
    command,
    args,
    input: promptMode === 'stdin' ? prompt : undefined,
    signal: req.signal,
    cwd: typeof cfg.workdir === 'string' && cfg.workdir ? cfg.workdir : undefined,
    env: cfg.env,
  })) {
    const text = stripAnsi(chunk)
    if (text) yield { type: 'text', text }
  }
  yield { type: 'done' }
}

async function* streamLocal(req: StreamRequest): AsyncGenerator<StreamPart> {
  const raw = streamLocalRaw(req)
  if (!req.tools.length) {
    yield* raw
    return
  }
  yield* applyPromptToolFilter(raw)
}

async function listLocalModels(provider: Provider): Promise<string[]> {
  const models = provider.models?.length ? provider.models : []
  if (models.length) return models
  if (provider.defaultModel) return [provider.defaultModel]
  throw new Error(
    'This local harness does not expose a model list. Enter model IDs manually, or leave the model empty to use the harness default.',
  )
}

async function testLocal(provider: Provider): Promise<string> {
  const cfg = config(provider)
  const command = String(cfg.command || '').trim()
  if (!command) throw new Error('Local harness command is missing.')
  const base = {
    command,
    cwd: typeof cfg.workdir === 'string' && cfg.workdir ? cfg.workdir : undefined,
    env: cfg.env,
    timeoutMs: 12_000,
  }

  let lastError = ''
  for (const flag of ['--version', '--help']) {
    try {
      const output = await runOnce({ ...base, args: [flag] })
      const line = stripAnsi(output).trim().split('\n').find(Boolean) || 'installed'
      return `Local harness found · ${line.slice(0, 120)}`
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
    }
  }
  throw new Error(
    `Could not run the local harness "${command}". Check the command path and working directory. ${lastError}`,
  )
}

export const localHarnessAdapter: ProviderAdapter = {
  stream: streamLocal,
  listModels: listLocalModels,
  test: testLocal,
}
