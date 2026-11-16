import { bus } from './bus.js'
import { config } from './config.js'
import { testProvider } from './providers/index.js'
import {
  createProvider,
  getProvider,
  getSettings,
  listProviders,
  setProviderConnection,
  updateSettings,
} from './store.js'
import type { Provider, ProviderKind } from './types.js'
import { now } from './util.js'

const HARNESS_KINDS = new Set<ProviderKind>([
  'opencode',
  'opencode-server',
  'claude-code',
  'local-harness',
])

let autoConnectRunning = false

export async function refreshProviderConnection(
  providerOrId: Provider | string,
): Promise<boolean> {
  const provider = typeof providerOrId === 'string' ? getProvider(providerOrId) : providerOrId
  if (!provider || !HARNESS_KINDS.has(provider.kind)) return false
  try {
    await testProvider(provider)
    setProviderConnection(provider.id, true)
    bus.emit('providers.changed', {})
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    setProviderConnection(provider.id, false, message)
    bus.emit('providers.changed', {})
    return false
  }
}

/**
 * On a fresh install, look for the local OpenCode CLI and create a default
 * harness automatically. In Docker this simply fails (the CLI is not in the
 * image) and the user can connect the host OpenCode server instead.
 */
async function ensureDefaultHarness(): Promise<void> {
  const existing = listProviders().filter((provider) => HARNESS_KINDS.has(provider.kind))
  if (existing.length) return
  const t = now()
  const draft: Provider = {
    id: 'draft',
    name: 'OpenCode CLI',
    kind: 'opencode',
    baseUrl: '',
    apiKey: '',
    apiVersion: '',
    defaultModel: '',
    models: [],
    config: { command: config.opencodeBin },
    lastConnectedAt: 0,
    lastConnectionError: '',
    createdAt: t,
    updatedAt: t,
  }
  try {
    await testProvider(draft)
  } catch {
    return
  }
  const created = createProvider({
    name: 'OpenCode CLI',
    kind: 'opencode',
    config: { command: config.opencodeBin },
  })
  setProviderConnection(created.id, true)
  if (!getSettings().defaultProviderId) {
    updateSettings({ defaultProviderId: created.id })
  }
  bus.emit('providers.changed', {})
}

/**
 * Test every configured harness once at startup so the model picker only
 * offers models from harnesses that are actually reachable.
 */
export async function autoConnectHarnesses(): Promise<void> {
  if (autoConnectRunning) return
  autoConnectRunning = true
  let changed = false
  try {
    await ensureDefaultHarness()
    for (const provider of listProviders()) {
      if (!HARNESS_KINDS.has(provider.kind)) continue
      await refreshProviderConnection(provider)
      changed = true
    }
    if (changed) bus.emit('providers.changed', {})
  } finally {
    autoConnectRunning = false
  }
}
