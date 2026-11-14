import { createHash, randomBytes } from 'node:crypto'
import { config } from './config.js'
import {
  clearMcpOAuthTokens,
  getMcpOAuthTokens,
  setMcpOAuthTokens,
} from './store.js'
import type { McpOAuthTokens, McpServerInternal } from './types.js'

const REQUEST_TIMEOUT_MS = 15_000
const PENDING_TTL_MS = 10 * 60 * 1_000

interface OAuthDiscovery {
  authorizationEndpoint: string
  tokenEndpoint: string
  registrationEndpoint?: string
  scopesSupported: string[]
}

interface PendingOAuth {
  serverId: string
  clientId: string
  clientSecret?: string
  redirectUri: string
  codeVerifier: string
  tokenEndpoint: string
  resource: string
  scope: string
  authorizationUrl: string
  proxied: boolean
  activepiecesUiOrigin?: string
  createdAt: number
}

const pending = new Map<string, PendingOAuth>()

export class OAuthRequiredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OAuthRequiredError'
  }
}

function base64Url(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  return host === 'localhost' || host === '127.0.0.1' || host === '::1'
}

function isActivepieces(server: McpServerInternal): boolean {
  return server.name.trim().toLowerCase() === 'activepieces'
}

/**
 * The URL that the Shelclaw *server* should call. In the self-hosted Docker
 * stack the browser URL (localhost:8080) points at the Shelclaw container, so
 * map it to the Activepieces service URL when one is configured.
 */
export function effectiveMcpServerUrl(server: McpServerInternal): string {
  if (!isActivepieces(server) || !config.activepiecesMcpUrl) return server.url
  try {
    const target = new URL(server.url)
    if (!isLoopbackHost(target.hostname)) return server.url
    const internal = new URL(config.activepiecesMcpUrl)
    const path = target.pathname.startsWith('/mcp') ? target.pathname : internal.pathname
    return new URL(`${path}${target.search || internal.search}`, internal.origin).toString()
  } catch {
    return server.url
  }
}

function activepiecesUiOrigin(server: McpServerInternal): string | undefined {
  if (!isActivepieces(server)) return undefined
  if (config.activepiecesUiUrl) {
    try {
      return new URL(config.activepiecesUiUrl).origin
    } catch {
      // fall back to the stored browser URL
    }
  }
  try {
    const target = new URL(server.url)
    if (isLoopbackHost(target.hostname)) return target.origin
  } catch {
    // no usable browser URL
  }
  return undefined
}

function describeFetchError(url: string, error: unknown): string {
  const cause = (error as { cause?: { code?: string; message?: string } } | undefined)?.cause
  const code = cause?.code || cause?.message || (error instanceof Error ? error.message : '')
  let host = url
  try {
    host = new URL(url).host
  } catch {
    // keep the raw URL
  }
  if (code === 'ECONNREFUSED') {
    return `Could not connect to ${host}. Is the MCP server running?`
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return `Could not resolve ${host}. Check the server URL.`
  }
  if (code === 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY' || code === 'SELF_SIGNED_CERT_IN_CHAIN') {
    return `TLS certificate verification failed for ${host}. Configure the CA bundle for Shelclaw.`
  }
  if (code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT') {
    return `Timed out connecting to ${host}.`
  }
  return `Could not reach ${host}${code ? ` (${code})` : ''}.`
}

export async function fetchMcpResponse(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (error) {
    throw new Error(describeFetchError(url, error))
  }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetchMcpResponse(url, {
    ...init,
    headers: {
      accept: 'application/json',
      ...(init?.headers || {}),
    },
  })
  const text = await response.text()
  if (!response.ok) {
    let detail = text.slice(0, 300)
    try {
      const parsed = JSON.parse(text) as { error_description?: string; message?: string }
      detail = parsed.error_description || parsed.message || detail
    } catch {
      // keep raw text
    }
    throw new Error(`OAuth endpoint returned HTTP ${response.status}${detail ? `: ${detail}` : ''}.`)
  }
  return JSON.parse(text) as T
}

function metadataUrl(baseUrl: string, suffix: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${suffix}`
}

/**
 * Some servers build public URLs from the request host, which can omit a
 * non-default port (Fastify's req.hostname excludes it). When the advertised
 * origin matches the MCP server host but has no port, restore the port we
 * actually connected to.
 */
function withTargetPort(endpoint: string, serverUrl: string): string {
  try {
    const parsed = new URL(endpoint)
    const target = new URL(serverUrl)
    if (!parsed.port && target.port && parsed.hostname === target.hostname) {
      parsed.port = target.port
    }
    return parsed.toString().replace(/\/$/, '')
  } catch {
    return endpoint
  }
}

async function discover(serverUrl: string): Promise<OAuthDiscovery> {
  const target = new URL(serverUrl)
  const path = target.pathname.replace(/\/+$/, '')
  const candidates = [
    metadataUrl(target.origin, `/.well-known/oauth-protected-resource${path}`),
    metadataUrl(target.origin, '/.well-known/oauth-protected-resource'),
  ]

  let authorizationServer = target.origin
  let scopes: string[] = []
  let protectedMetadata: { authorization_servers?: string[]; scopes_supported?: string[] } | null =
    null

  for (const candidate of candidates) {
    try {
      protectedMetadata = await fetchJson<{
        authorization_servers?: string[]
        scopes_supported?: string[]
      }>(candidate)
      break
    } catch {
      // try the next well-known location
    }
  }

  if (protectedMetadata?.authorization_servers?.length) {
    authorizationServer = withTargetPort(protectedMetadata.authorization_servers[0], serverUrl)
  }
  if (protectedMetadata?.scopes_supported?.length) {
    scopes = protectedMetadata.scopes_supported
  }

  const authCandidates = [
    metadataUrl(authorizationServer, '/.well-known/oauth-authorization-server'),
    metadataUrl(authorizationServer, '/.well-known/openid-configuration'),
  ]
  let metadata: {
    authorization_endpoint?: string
    token_endpoint?: string
    registration_endpoint?: string
    scopes_supported?: string[]
  } | null = null
  let lastError: unknown
  for (const candidate of authCandidates) {
    try {
      metadata = await fetchJson(candidate)
      break
    } catch (error) {
      lastError = error
      // try the next metadata document
    }
  }
  if (!metadata?.authorization_endpoint || !metadata.token_endpoint) {
    if (
      lastError instanceof Error &&
      /^(Could not|Timed out|TLS certificate)/.test(lastError.message)
    ) {
      throw lastError
    }
    throw new Error(
      'This MCP server did not advertise an OAuth authorization endpoint. Add credentials manually instead.',
    )
  }
  return {
    authorizationEndpoint: withTargetPort(metadata.authorization_endpoint, serverUrl),
    tokenEndpoint: withTargetPort(metadata.token_endpoint, serverUrl),
    registrationEndpoint: metadata.registration_endpoint
      ? withTargetPort(metadata.registration_endpoint, serverUrl)
      : undefined,
    scopesSupported: metadata.scopes_supported?.length ? metadata.scopes_supported : scopes,
  }
}

function tokenRequestJson(result: {
  access_token?: unknown
  refresh_token?: unknown
  expires_in?: unknown
  scope?: unknown
}): McpOAuthTokens | null {
  const accessToken = String(result.access_token || '')
  const refreshToken = String(result.refresh_token || '')
  if (!accessToken) return null
  const expiresIn = Number(result.expires_in) || 3600
  return {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + Math.max(60, expiresIn - 30) * 1_000,
    tokenEndpoint: '',
    clientId: '',
    scope: typeof result.scope === 'string' ? result.scope : undefined,
  }
}

function formBody(values: Record<string, string | undefined>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') params.set(key, value)
  }
  return params.toString()
}

function cleanupPending(): void {
  const cutoff = Date.now() - PENDING_TTL_MS
  for (const [state, entry] of pending) {
    if (entry.createdAt < cutoff) pending.delete(state)
  }
}

export interface StartOAuthResult {
  authorizationUrl: string
}

export async function startMcpOAuth(
  server: McpServerInternal,
  redirectBaseUrl: string,
): Promise<StartOAuthResult> {
  if (server.transport !== 'http') {
    throw new Error('OAuth is only available for HTTP MCP servers.')
  }
  const redirectBase = new URL(redirectBaseUrl)
  if (redirectBase.protocol !== 'http:' && redirectBase.protocol !== 'https:') {
    throw new Error('Enter a valid http:// or https:// app URL.')
  }
  const redirectUri = `${redirectBase.origin}/api/mcp/oauth/callback`
  const serverUrl = effectiveMcpServerUrl(server)
  const discovery = await discover(serverUrl)

  let clientId = ''
  let clientSecret: string | undefined
  if (discovery.registrationEndpoint) {
    const registration = await fetchJson<{
      client_id?: string
      client_secret?: string
    }>(discovery.registrationEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Shelclaw',
        redirect_uris: [redirectUri],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        scope: 'mcp',
      }),
    })
    clientId = String(registration.client_id || '')
    clientSecret = registration.client_secret
  }
  if (!clientId) {
    throw new Error(
      'This MCP server does not support dynamic client registration. Add an Authorization header manually instead.',
    )
  }

  const verifier = base64Url(randomBytes(48))
  const challenge = base64Url(createHash('sha256').update(verifier).digest())
  const state = base64Url(randomBytes(24))
  const scope =
    discovery.scopesSupported.find((entry) => entry === 'mcp') ||
    discovery.scopesSupported[0] ||
    'mcp'

  const authorizationUrl = new URL(discovery.authorizationEndpoint)
  authorizationUrl.searchParams.set('client_id', clientId)
  authorizationUrl.searchParams.set('redirect_uri', redirectUri)
  authorizationUrl.searchParams.set('response_type', 'code')
  authorizationUrl.searchParams.set('code_challenge', challenge)
  authorizationUrl.searchParams.set('code_challenge_method', 'S256')
  authorizationUrl.searchParams.set('state', state)
  authorizationUrl.searchParams.set('scope', scope)
  authorizationUrl.searchParams.set('resource', serverUrl)

  const uiOrigin = activepiecesUiOrigin(server)
  const proxied = Boolean(uiOrigin)
  cleanupPending()
  pending.set(state, {
    serverId: server.id,
    clientId,
    clientSecret,
    redirectUri,
    codeVerifier: verifier,
    tokenEndpoint: discovery.tokenEndpoint,
    resource: serverUrl,
    scope,
    authorizationUrl: authorizationUrl.toString(),
    proxied,
    activepiecesUiOrigin: uiOrigin,
    createdAt: Date.now(),
  })

  return {
    authorizationUrl: proxied
      ? `${redirectBase.origin}/api/mcp/oauth/authorize?state=${encodeURIComponent(state)}`
      : authorizationUrl.toString(),
  }
}

export interface PendingAuthorizeResult {
  authorizationUrl: string
  proxied: boolean
  activepiecesUiOrigin?: string
}

export function getPendingOAuthAuthorize(state: string): PendingAuthorizeResult | null {
  const entry = pending.get(state)
  if (!entry || entry.createdAt < Date.now() - PENDING_TTL_MS) return null
  return {
    authorizationUrl: entry.authorizationUrl,
    proxied: entry.proxied,
    activepiecesUiOrigin: entry.activepiecesUiOrigin,
  }
}

function rewriteConsentRedirect(location: string, uiOrigin: string): string {
  try {
    const target = new URL(location)
    const ui = new URL(uiOrigin)
    const loopbackWithoutPort =
      isLoopbackHost(target.hostname) && !target.port && Boolean(ui.port)
    if (target.origin === ui.origin) return target.toString()
    if (loopbackWithoutPort) {
      target.protocol = ui.protocol
      target.host = ui.host
      return target.toString()
    }
    return location
  } catch {
    return location
  }
}

export async function fetchAuthorizeRedirect(
  state: string,
): Promise<{ location: string; status: number } | { error: string; status: number }> {
  const entry = getPendingOAuthAuthorize(state)
  if (!entry) return { error: 'This authorization request expired. Start again.', status: 400 }
  if (!entry.proxied || !entry.activepiecesUiOrigin) {
    return { location: entry.authorizationUrl, status: 302 }
  }
  const ui = new URL(entry.activepiecesUiOrigin)
  let response: Response
  try {
    response = await fetchMcpResponse(entry.authorizationUrl, {
      redirect: 'manual',
      headers: {
        accept: 'text/html',
        'x-forwarded-host': ui.host,
        'x-forwarded-proto': ui.protocol.replace(':', ''),
      },
    })
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Could not reach Activepieces.',
      status: 502,
    }
  }
  const location = response.headers.get('location')
  if (!location) {
    const text = (await response.text()).slice(0, 400)
    return {
      error: `Activepieces did not return an authorization redirect (HTTP ${response.status}${text ? `: ${text}` : ''}).`,
      status: 502,
    }
  }
  return { location: rewriteConsentRedirect(location, entry.activepiecesUiOrigin), status: 302 }
}

function parseTokenResponse(
  result: unknown,
  params: {
    tokenEndpoint: string
    clientId: string
    clientSecret?: string
    resource: string
    scope?: string
    previousRefreshToken?: string
  },
): McpOAuthTokens {
  if (!result || typeof result !== 'object') {
    throw new Error('The OAuth token endpoint returned an unreadable response.')
  }
  const record = result as {
    access_token?: unknown
    refresh_token?: unknown
    expires_in?: unknown
    scope?: unknown
  }
  const tokens = tokenRequestJson(record)
  if (!tokens) throw new Error('The OAuth token endpoint did not return an access token.')
  return {
    ...tokens,
    refreshToken: tokens.refreshToken || params.previousRefreshToken || '',
    tokenEndpoint: params.tokenEndpoint,
    clientId: params.clientId,
    clientSecret: params.clientSecret,
    resource: params.resource,
    scope: typeof record.scope === 'string' ? record.scope : params.scope,
  }
}

export async function completeMcpOAuth(
  state: string,
  code: string,
): Promise<{ serverId: string }> {
  const entry = pending.get(state)
  if (!entry || entry.createdAt < Date.now() - PENDING_TTL_MS) {
    throw new Error('This authorization request expired. Start again.')
  }
  pending.delete(state)
  const response = await fetchMcpResponse(entry.tokenEndpoint, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: formBody({
      grant_type: 'authorization_code',
      code,
      redirect_uri: entry.redirectUri,
      client_id: entry.clientId,
      client_secret: entry.clientSecret,
      code_verifier: entry.codeVerifier,
      resource: entry.resource,
    }),
  })
  const text = await response.text()
  if (!response.ok) {
    let detail = text.slice(0, 300)
    try {
      const parsed = JSON.parse(text) as { error_description?: string; error?: string }
      detail = parsed.error_description || parsed.error || detail
    } catch {
      // keep raw text
    }
    throw new Error(`Authorization failed (HTTP ${response.status}${detail ? `: ${detail}` : ''}).`)
  }
  const tokens = parseTokenResponse(JSON.parse(text), {
    tokenEndpoint: entry.tokenEndpoint,
    clientId: entry.clientId,
    clientSecret: entry.clientSecret,
    resource: entry.resource,
    scope: entry.scope,
  })
  setMcpOAuthTokens(entry.serverId, tokens)
  return { serverId: entry.serverId }
}

async function refreshAccessToken(tokens: McpOAuthTokens): Promise<McpOAuthTokens> {
  if (!tokens.refreshToken) {
    throw new OAuthRequiredError(
      'Authorization expired and no refresh token is available. Click Authorize again.',
    )
  }
  const response = await fetchMcpResponse(tokens.tokenEndpoint, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: formBody({
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken,
      client_id: tokens.clientId,
      client_secret: tokens.clientSecret,
      resource: tokens.resource,
    }),
  })
  if (!response.ok) {
    throw new OAuthRequiredError(
      'Authorization expired. Click Authorize again to reconnect this MCP server.',
    )
  }
  const text = await response.text()
  const next = parseTokenResponse(JSON.parse(text), {
    tokenEndpoint: tokens.tokenEndpoint,
    clientId: tokens.clientId,
    clientSecret: tokens.clientSecret,
    resource: tokens.resource || '',
    scope: tokens.scope,
    previousRefreshToken: tokens.refreshToken,
  })
  return next
}

export function hasMcpOAuth(server: McpServerInternal): boolean {
  return Boolean(getMcpOAuthTokens(server.id))
}

export async function getMcpAccessToken(
  server: McpServerInternal,
  options?: { forceRefresh?: boolean },
): Promise<string> {
  const tokens = getMcpOAuthTokens(server.id)
  if (!tokens) {
    throw new OAuthRequiredError('This MCP server requires OAuth sign-in.')
  }
  if (!options?.forceRefresh && tokens.expiresAt - 60_000 > Date.now()) {
    return tokens.accessToken
  }
  try {
    const refreshed = await refreshAccessToken(tokens)
    setMcpOAuthTokens(server.id, refreshed)
    return refreshed.accessToken
  } catch (error) {
    clearMcpOAuthTokens(server.id)
    throw error
  }
}

export function disconnectMcpOAuth(serverId: string): void {
  clearMcpOAuthTokens(serverId)
}
