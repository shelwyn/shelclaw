import fs from 'node:fs'
import path from 'node:path'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { bus } from './bus.js'
import { config } from './config.js'
import { db } from './db.js'
import { AppError } from './errors.js'
import { orchestrator } from './orchestrator/engine.js'
import { discoverModels, PROVIDER_KINDS, testProvider } from './providers/index.js'
import {
  activeRuns,
  createAgent,
  createAgentLink,
  createChat,
  createProject,
  createProvider,
  deleteAgent,
  deleteAgentLink,
  deleteChat,
  deleteProject,
  deleteProvider,
  ensureProjectOrchestrator,
  getAgent,
  getChat,
  getChatDetail,
  getMemoryGraph,
  getOrCreateDirectChat,
  getOrchestrator,
  getProject,
  getProvider,
  getSettings,
  listAgents,
  listChats,
  listProjects,
  listSafeProviders,
  safeProvider,
  setChatArchived,
  updateAgent,
  updateChat,
  updateProject,
  updateProvider,
  updateSettings,
} from './store.js'
import type { Provider, ProviderKind } from './types.js'
import { now } from './util.js'
const providerKind = z.enum([
  'opencode-server',
  'opencode',
  'claude-code',
  'local-harness',
])

const providerInput = z.object({
  providerId: z.string().max(100).optional(),
  name: z.string().min(1).max(80).optional(),
  kind: providerKind.optional(),
  baseUrl: z.string().max(600).optional(),
  apiKey: z.string().max(4000).optional(),
  apiVersion: z.string().max(100).optional(),
  defaultModel: z.string().max(300).optional(),
  models: z.array(z.string().max(300)).max(500).optional(),
  config: z.record(z.unknown()).optional(),
})

const projectInput = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(4000).optional(),
  systemPrompt: z.string().max(30000).optional(),
  color: z.string().max(30).optional(),
})

const agentInput = z.object({
  projectId: z.string().max(100).optional(),
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(1000).optional(),
  systemPrompt: z.string().max(60000).optional(),
  color: z.string().max(30).optional(),
  providerId: z.string().max(100).optional(),
  model: z.string().max(300).optional(),
  maxDepth: z.number().int().min(0).max(6).optional(),
  maxSteps: z.number().int().min(1).max(30).optional(),
  canSpawn: z.boolean().optional(),
})

const chatInput = z.object({
  title: z.string().min(1).max(200).optional(),
  projectId: z.string().max(100).optional(),
  agentId: z.string().max(100).optional(),
  providerId: z.string().max(100).optional(),
  model: z.string().max(300).optional(),
  archived: z.boolean().optional(),
})

const settingsInput = z.object({
  defaultProviderId: z.string().max(100).optional(),
  defaultModel: z.string().max(300).optional(),
  maxDepth: z.number().int().min(0).max(6).optional(),
  maxParallel: z.number().int().min(1).max(8).optional(),
  maxAgents: z.number().int().min(1).max(64).optional(),
  maxSteps: z.number().int().min(1).max(30).optional(),
  workspaceName: z.string().min(1).max(60).optional(),
  autoTitle: z.boolean().optional(),
})

function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    const issue = result.error.issues[0]
    throw new AppError(`${issue.path.join('.') || 'body'}: ${issue.message}`, 400)
  }
  return result.data
}

/**
 * Accept a pasted OpenCode server URL such as
 *   http://opencode:<password>@192.168.1.20:4096
 * Store the password in the secret field and keep the URL clean.
 */
function normalizeOpenCodeServerUrl<T extends { kind?: string; baseUrl?: string; apiKey?: string }>(
  input: T,
): T {
  if (input.kind !== 'opencode-server' || !input.baseUrl) return input
  try {
    const url = new URL(input.baseUrl)
    let changed = false
    if (url.hostname === '0.0.0.0' || url.hostname === '::' || url.hostname === '[::]') {
      url.hostname = '127.0.0.1'
      changed = true
    }
    const password = decodeURIComponent(url.password || '')
    if (url.username || url.password) {
      url.username = ''
      url.password = ''
      changed = true
    }
    if (!changed) return input
    url.search = ''
    url.hash = ''
    return {
      ...input,
      baseUrl: url.toString().replace(/\/+$/, ''),
      ...(input.apiKey || !password ? {} : { apiKey: password }),
    }
  } catch {
    return input
  }
}

function draftProvider(input: z.infer<typeof providerInput>): Provider {
  const existing = input.providerId ? getProvider(input.providerId) : undefined
  const t = now()
  return {
    id: existing?.id || 'draft',
    name: input.name || existing?.name || 'Harness',
    kind: (input.kind || existing?.kind || 'openai') as ProviderKind,
    baseUrl: input.baseUrl ?? existing?.baseUrl ?? '',
    apiKey: input.apiKey ?? existing?.apiKey ?? '',
    apiVersion: input.apiVersion ?? existing?.apiVersion ?? '',
    defaultModel: input.defaultModel ?? existing?.defaultModel ?? '',
    models: input.models ?? existing?.models ?? [],
    config: input.config ?? existing?.config ?? {},
    createdAt: existing?.createdAt || t,
    updatedAt: t,
  }
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/health', async () => ({
    ok: true,
    authRequired: Boolean(config.appToken),
    version: '0.1.0',
    providerCount: listSafeProviders().length,
  }))

  app.get('/api/bootstrap', async () => {
    const providers = listSafeProviders()
    return {
      providers,
      projects: listProjects(),
      agents: listAgents(),
      chats: listChats(),
      settings: getSettings(),
      activeRuns: activeRuns(),
      providerKinds: PROVIDER_KINDS,
      authRequired: Boolean(config.appToken),
    }
  })

  app.get('/api/events', async (req, reply) => {
    reply.hijack()
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    })
    reply.raw.write(': connected\n\n')

    const unsubscribe = bus.subscribe((event) => {
      try {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
      } catch {
        // client disconnected
      }
    })
    const ping = setInterval(() => {
      try {
        reply.raw.write(': ping\n\n')
      } catch {
        // ignore
      }
    }, 15000)
    ping.unref()

    const close = () => {
      clearInterval(ping)
      unsubscribe()
    }
    req.raw.on('close', close)
    req.raw.on('error', close)
  })

  /* --------------------------------- providers -------------------------------- */

  app.post('/api/providers', async (req) => {
    const input = normalizeOpenCodeServerUrl(parse(providerInput, req.body))
    if (!input.name) throw new AppError('name is required', 400)
    return safeProvider(createProvider({ ...input, name: input.name, kind: input.kind as ProviderKind }))
  })

  app.patch('/api/providers/:id', async (req) => {
    const { id } = req.params as { id: string }
    const input = normalizeOpenCodeServerUrl(parse(providerInput, req.body))
    const updated = updateProvider(id, input)
    if (!updated) throw new AppError('Provider not found.', 404)
    return safeProvider(updated)
  })

  app.delete('/api/providers/:id', async (req) => {
    const { id } = req.params as { id: string }
    const ok = deleteProvider(id)
    if (!ok) throw new AppError('Provider not found.', 404)
    db.prepare("UPDATE agents SET provider_id = '', updated_at = ? WHERE provider_id = ?").run(now(), id)
    return { ok: true }
  })

  app.post('/api/providers/:id/models', async (req) => {
    const { id } = req.params as { id: string }
    const provider = getProvider(id)
    if (!provider) throw new AppError('Provider not found.', 404)
    try {
      const models = await discoverModels(provider)
      if (models.length) updateProvider(id, { models })
      return { models, count: models.length }
    } catch (err) {
      throw new AppError(err instanceof Error ? err.message : 'Could not fetch models.', 400)
    }
  })

  // Draft probes let the Add/Edit form test and discover models before saving.
  app.post('/api/providers/probe', async (req) => {
    const input = normalizeOpenCodeServerUrl(parse(providerInput, req.body))
    const provider = draftProvider(input)
    try {
      return { ok: true, message: await testProvider(provider) }
    } catch (err) {
      throw new AppError(err instanceof Error ? err.message : 'Connection failed.', 400)
    }
  })

  app.post('/api/providers/discover', async (req) => {
    const input = normalizeOpenCodeServerUrl(parse(providerInput, req.body))
    const provider = draftProvider(input)
    try {
      const models = await discoverModels(provider)
      return { models, count: models.length }
    } catch (err) {
      throw new AppError(err instanceof Error ? err.message : 'Could not fetch models.', 400)
    }
  })

  app.post('/api/providers/:id/test', async (req) => {
    const { id } = req.params as { id: string }
    const provider = getProvider(id)
    if (!provider) throw new AppError('Provider not found.', 404)
    try {
      const message = await testProvider(provider)
      return { ok: true, message }
    } catch (err) {
      throw new AppError(err instanceof Error ? err.message : 'Connection failed.', 400)
    }
  })

  /* ---------------------------------- projects --------------------------------- */

  app.post('/api/projects', async (req) => {
    const input = parse(projectInput, req.body)
    if (!input.name) throw new AppError('name is required', 400)
    return createProject({ ...input, name: input.name })
  })

  app.patch('/api/projects/:id', async (req) => {
    const { id } = req.params as { id: string }
    const updated = updateProject(id, parse(projectInput, req.body))
    if (!updated) throw new AppError('Project not found.', 404)
    return updated
  })

  app.delete('/api/projects/:id', async (req) => {
    const { id } = req.params as { id: string }
    const running = listChats().some(
      (chat) => chat.projectId === id && orchestrator.activeRunForChat(chat.id),
    )
    if (running) throw new AppError('Stop this project’s active runs before deleting it.', 409)
    if (!deleteProject(id)) throw new AppError('Project not found.', 404)
    bus.emit('chats.changed', {})
    return { ok: true }
  })

  app.get('/api/projects/:id/memory', async (req) => {
    const { id } = req.params as { id: string }
    if (!getProject(id)) throw new AppError('Project not found.', 404)
    return getMemoryGraph(id)
  })

  app.post('/api/projects/:id/links', async (req) => {
    const { id } = req.params as { id: string }
    const body = parse(
      z.object({ agentA: z.string().max(100), agentB: z.string().max(100) }),
      req.body,
    )
    const link = createAgentLink(id, body.agentA, body.agentB)
    if (!link) throw new AppError('Those agents cannot be linked in this project.', 400)
    bus.emit('memory.changed', { projectId: id })
    return link
  })

  app.delete('/api/links/:id', async (req) => {
    const { id } = req.params as { id: string }
    if (!deleteAgentLink(id)) throw new AppError('Link not found.', 404)
    bus.emit('memory.changed', {})
    return { ok: true }
  })

  /* ----------------------------------- agents ----------------------------------- */

  app.post('/api/agents', async (req) => {
    const input = parse(agentInput, req.body)
    if (!input.name) throw new AppError('name is required', 400)
    if (!input.projectId) throw new AppError('Create or select a project first.', 400)
    const project = getProject(input.projectId)
    if (!project) throw new AppError('Project not found.', 404)
    const agent = createAgent({ ...input, name: input.name, projectId: input.projectId })
    bus.emit('agents.changed', {})
    return agent
  })

  app.patch('/api/agents/:id', async (req) => {
    const { id } = req.params as { id: string }
    const updated = updateAgent(id, parse(agentInput, req.body))
    if (!updated) throw new AppError('Agent not found.', 404)
    bus.emit('agents.changed', {})
    return updated
  })

  app.delete('/api/agents/:id', async (req) => {
    const { id } = req.params as { id: string }
    const agent = getAgent(id)
    if (!agent) throw new AppError('Agent not found.', 404)
    if (agent.isOrchestrator) throw new AppError('The project orchestrator cannot be deleted.', 400)
    const running = db
      .prepare("SELECT COUNT(*) AS n FROM chats WHERE agent_id = ? AND status = 'running'")
      .get(id) as { n: number }
    if (Number(running.n) > 0) {
      throw new AppError('Stop this agent’s active chats before deleting it.', 409)
    }
    if (!deleteAgent(id)) throw new AppError('Agent not found.', 404)
    bus.emit('agents.changed', {})
    return { ok: true }
  })

  app.post('/api/agents/:id/chat', async (req) => {
    const { id } = req.params as { id: string }
    const agent = getAgent(id)
    if (!agent) throw new AppError('Agent not found.', 404)
    if (!agent.projectId) throw new AppError('This agent is not attached to a project.', 400)
    ensureProjectOrchestrator(agent.projectId)
    const chat = getOrCreateDirectChat(id)
    if (!chat) throw new AppError('Could not open an agent chat.', 400)
    bus.emit('chats.changed', {})
    return chat
  })

  /* ------------------------------------ chats ----------------------------------- */

  app.post('/api/chats', async (req) => {
    const input = parse(chatInput, req.body)
    if (!input.projectId) throw new AppError('Create or select a project first.', 400)
    const project = getProject(input.projectId)
    if (!project) throw new AppError('Project not found.', 404)
    const agent = input.agentId ? getAgent(input.agentId) : getOrchestrator(project.id)
    if (input.agentId && (!agent || agent.projectId !== project.id)) {
      throw new AppError('Agent does not belong to this project.', 400)
    }
    const settings = getSettings()
    const chat = createChat({
      title: input.title || 'New chat',
      projectId: project.id,
      agentId: agent?.id || '',
      providerId: input.providerId || agent?.providerId || settings.defaultProviderId || '',
      model: input.model || agent?.model || settings.defaultModel || '',
      kind: 'root',
      rootChatId: '',
    })
    bus.emit('chats.changed', {})
    return chat
  })

  app.get('/api/chats/:id', async (req) => {
    const { id } = req.params as { id: string }
    const detail = getChatDetail(id)
    if (!detail) throw new AppError('Chat not found.', 404)
    return { ...detail, activeRunId: orchestrator.activeRunForChat(id) || '' }
  })

  app.patch('/api/chats/:id', async (req) => {
    const { id } = req.params as { id: string }
    const input = parse(chatInput, req.body)
    const { archived, ...rest } = input
    if (archived !== undefined && orchestrator.isRunning(id)) {
      throw new AppError('Stop this chat’s active run before archiving it.', 409)
    }
    let chat = Object.keys(rest).length ? updateChat(id, rest) : getChat(id)
    if (archived !== undefined) {
      chat = setChatArchived(id, archived)
    }
    if (!chat) throw new AppError('Chat not found.', 404)
    bus.emit('chat.updated', { chatId: id, chat })
    bus.emit('chats.changed', {})
    return chat
  })

  app.delete('/api/chats/:id', async (req) => {
    const { id } = req.params as { id: string }
    if (orchestrator.isRunning(id)) {
      throw new AppError('Stop this chat’s active run before deleting it.', 409)
    }
    orchestrator.cancelChat(id)
    if (!deleteChat(id)) throw new AppError('Chat not found.', 404)
    bus.emit('chats.changed', {})
    return { ok: true }
  })

  app.post('/api/chats/:id/messages', async (req) => {
    const { id } = req.params as { id: string }
    const body = parse(
      z.object({
        content: z.string().min(1).max(200_000),
        agentId: z.string().max(100).optional(),
        providerId: z.string().max(100).optional(),
        model: z.string().max(300).optional(),
      }),
      req.body,
    )
    const run = await orchestrator.startChat(id, body.content, body)
    return { run, chatId: id }
  })

  app.post('/api/chats/:id/cancel', async (req) => {
    const { id } = req.params as { id: string }
    return { ok: orchestrator.cancelChat(id) }
  })

  app.post('/api/runs/:id/cancel', async (req) => {
    const { id } = req.params as { id: string }
    return { ok: orchestrator.cancelRun(id) }
  })

  /* ---------------------------------- settings ---------------------------------- */

  app.patch('/api/settings', async (req) => {
    const input = parse(settingsInput, req.body)
    const settings = updateSettings(input)
    bus.emit('settings.changed', { settings })
    return settings
  })

  app.get('/api/fs/check', async () => ({
    webBuilt: fs.existsSync(path.join(config.webDist, 'index.html')),
  }))
}
