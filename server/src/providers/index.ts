import type { Provider, ProviderKind } from '../types.js'
import type { ProviderAdapter, StreamRequest } from './types.js'
import { anthropicAdapter } from './anthropic.js'
import { authHeaders, ollamaAdapter, openAIUrl, openaiAdapter } from './openai.js'
import { claudeCodeAdapter, opencodeAdapter } from './cli.js'
import { opencodeServerAdapter } from './opencode-server.js'
import { localHarnessAdapter } from './local-harness.js'

const adapters: Record<ProviderKind, ProviderAdapter> = {
  openai: openaiAdapter,
  azure: openaiAdapter,
  custom: openaiAdapter,
  ollama: ollamaAdapter,
  anthropic: anthropicAdapter,
  opencode: opencodeAdapter,
  'opencode-server': opencodeServerAdapter,
  'claude-code': claudeCodeAdapter,
  'local-harness': localHarnessAdapter,
}

export const PROVIDER_KINDS: ProviderKind[] = [
  'opencode-server',
  'opencode',
  'claude-code',
  'local-harness',
]

export function getAdapter(provider: Provider): ProviderAdapter {
  const adapter = adapters[provider.kind]
  if (!adapter) throw new Error(`Unsupported provider kind: ${provider.kind}`)
  return adapter
}

export async function* streamLLM(req: StreamRequest) {
  yield* getAdapter(req.provider).stream(req)
}

export async function discoverModels(provider: Provider): Promise<string[]> {
  const models = await getAdapter(provider).listModels(provider)
  return [...new Set(models.map((model) => model.trim()).filter(Boolean))]
}

export async function testProvider(provider: Provider): Promise<string> {
  if (provider.kind === 'azure') return testAzure(provider)
  try {
    return await getAdapter(provider).test(provider)
  } catch (err) {
    const model = provider.defaultModel || provider.models[0]
    if ((provider.kind === 'openai' || provider.kind === 'custom') && model) {
      return pingChat(provider, model)
    }
    throw err
  }
}

async function pingChat(provider: Provider, model: string): Promise<string> {
  const { postJson } = await import('./http.js')
  const res = await postJson(
    openAIUrl(provider, model),
    authHeaders(provider),
    {
      model,
      messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
      max_tokens: 2,
      stream: false,
    },
    undefined,
    { retries: 0 },
  )
  const data = await res.json().catch(() => null)
  if (!data) throw new Error('The endpoint responded, but not with a JSON completion.')
  return `Connected · model “${model}” responded`
}

async function testAzure(provider: Provider): Promise<string> {
  const { postJson } = await import('./http.js')
  const model = provider.defaultModel || provider.models[0]
  if (!model) return 'Configuration saved. Add a deployment name to run a live test.'
  const url = openAIUrl(provider, model)
  const res = await postJson(
    url,
    authHeaders(provider),
    {
      model,
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 1,
      stream: false,
    },
    undefined,
    { retries: 0 },
  )
  const data = await res.json().catch(() => null)
  if (!data) throw new Error('Azure responded, but the payload could not be parsed.')
  return `Connected · deployment “${model}” responded`
}
