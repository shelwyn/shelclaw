import fs from 'node:fs'
import path from 'node:path'
import Fastify from 'fastify'
import multipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import { config } from './config.js'
import { ensureSecretKey } from './crypto.js'
import { closeDb, db } from './db.js'
import { AppError } from './errors.js'
import { registerRoutes } from './routes.js'
import { autoConnectHarnesses } from './harness-health.js'
import { orchestrator } from './orchestrator/engine.js'
import {
  ensureProjectOrchestrators,
  ensureProjectWorkspaces,
  listQueuedChatIds,
  migrateProviderSecrets,
} from './store.js'
import { now } from './util.js'

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'warn',
  },
  bodyLimit: 4 * 1024 * 1024,
})

app.addHook('onRequest', async (req, reply) => {
  if (!config.appToken) return
  if (!req.url.startsWith('/api')) return
  if (req.url.startsWith('/api/health')) return
  // Browser redirects cannot send an Authorization header. These endpoints are
  // guarded by a one-time, high-entropy OAuth state instead.
  if (
    req.url.startsWith('/api/mcp/oauth/authorize') ||
    req.url.startsWith('/api/mcp/oauth/callback')
  ) {
    return
  }
  const header = req.headers.authorization || ''
  const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  const queryToken = (req.query as Record<string, unknown> | undefined)?.token
  const token = bearer || (typeof queryToken === 'string' ? queryToken : '')
  if (token !== config.appToken) {
    return reply.code(401).send({ error: 'Unauthorized. Provide a valid access token.' })
  }
})

app.setErrorHandler((err, req, reply) => {
  const anyErr = err as any
  if (err instanceof AppError) {
    return reply.code(err.status).send({ error: err.message })
  }
  const statusCode = anyErr.statusCode
  if (typeof statusCode === 'number' && statusCode < 500) {
    return reply.code(statusCode).send({ error: anyErr.message })
  }
  req.log.error({ err }, 'request failed')
  return reply.code(500).send({ error: anyErr.message || 'Internal server error' })
})

// Mark orphaned runs from a previous process as interrupted.
db.prepare(
  "UPDATE runs SET status = 'error', error = 'Server restarted before the run finished.', ended_at = ? WHERE status = 'running'",
).run(now())
db.prepare("UPDATE tasks SET status = 'error', error = 'Server restarted before the task finished.', ended_at = ? WHERE status IN ('running', 'queued')").run(now())
db.prepare("UPDATE chats SET status = 'idle' WHERE status = 'running'").run()

// Projects own their agents. New projects get an Orchestrator; older projects
// are repaired here without creating any user-facing default agents.
ensureProjectOrchestrators()
ensureProjectWorkspaces()
ensureSecretKey()
migrateProviderSecrets()

await app.register(multipart, {
  limits: { fileSize: 25 * 1024 * 1024, files: 8 },
})

await registerRoutes(app)

const indexFile = path.join(config.webDist, 'index.html')
if (fs.existsSync(indexFile)) {
  await app.register(fastifyStatic, {
    root: config.webDist,
    prefix: '/',
    wildcard: false,
  })
  app.setNotFoundHandler((req, reply) => {
    if (req.raw.url?.startsWith('/api')) {
      return reply.code(404).send({ error: 'Not found' })
    }
    return reply.sendFile('index.html')
  })
} else {
  app.get('/', async () => ({
    name: 'Shelclaw API',
    hint: 'The web app is not built. Run `npm run dev` for development or `npm run build` for production.',
    health: '/api/health',
  }))
  app.setNotFoundHandler((req, reply) => {
    if (req.raw.url?.startsWith('/api')) return reply.code(404).send({ error: 'Not found' })
    return reply.code(404).send({ error: 'Web app not built. Run `npm run build`.' })
  })
}

const shutdown = async (signal: string) => {
  app.log.info(`${signal} received, shutting down`)
  try {
    await app.close()
    closeDb()
  } finally {
    process.exit(0)
  }
}
process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))

try {
  await app.listen({ port: config.port, host: config.host })
  const host = config.host === '0.0.0.0' ? 'localhost' : config.host
  console.log(`\n  Shelclaw  →  http://${host}:${config.port}`)
  console.log(`  Data       →  ${config.dataDir}`)
  if (!config.appToken) console.log('  Auth       →  open (set APP_TOKEN to lock down remote access)')
  // Resume messages that were queued before the previous process stopped.
  for (const chatId of listQueuedChatIds()) orchestrator.drainQueue(chatId)
  // Mark reachable harnesses and refresh their model lists in the background.
  void autoConnectHarnesses()
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
