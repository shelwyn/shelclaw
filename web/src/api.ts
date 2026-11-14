import type {
  Agent,
  Artifact,
  Bootstrap,
  Chat,
  ChatDetail,
  ChatFile,
  McpServer,
  MemoryGraph,
  PreviewPayload,
  Project,
  Provider,
  QueuedMessage,
  Run,
  WorkspaceFile,
} from './types'

const TOKEN_KEY = 'ocx.token'

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

export function setToken(token: string): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // ignore
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  const isForm = typeof FormData !== 'undefined' && init.body instanceof FormData
  if (init.body && !isForm && !headers.has('content-type')) headers.set('content-type', 'application/json')
  const token = getToken()
  if (token) headers.set('authorization', `Bearer ${token}`)
  let res: Response
  try {
    res = await fetch(path, { ...init, headers })
  } catch (err) {
    const detail = err instanceof Error && err.message ? ` (${err.message})` : ''
    throw new ApiError(
      `Cannot reach the Shelclaw API${detail}. Check that the app server is running, then refresh this page.`,
      0,
    )
  }
  if (!res.ok) {
    let message = res.statusText || 'Request failed'
    try {
      const data = await res.json()
      if (data?.error) message = data.error
    } catch {
      // ignore
    }
    throw new ApiError(message, res.status)
  }
  if (res.status === 204) return undefined as T
  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('application/json')) return (await res.json()) as T
  return (await res.text()) as T
}

async function fetchBlob(path: string): Promise<Blob> {
  const headers = new Headers()
  const token = getToken()
  if (token) headers.set('authorization', `Bearer ${token}`)
  const res = await fetch(path, { headers })
  if (!res.ok) throw new ApiError('Could not read the file.', res.status)
  return res.blob()
}

function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

const json = (body: unknown): RequestInit => ({ body: JSON.stringify(body) })

export const api = {
  bootstrap: () => request<Bootstrap>('/api/bootstrap'),

  createChat: (body: { title?: string; projectId?: string; agentId?: string; providerId?: string; model?: string }) =>
    request<Chat>('/api/chats', { method: 'POST', ...json(body) }),
  chat: (id: string) => request<ChatDetail>(`/api/chats/${id}`),
  patchChat: (id: string, body: Partial<Chat> & { archived?: boolean }) =>
    request<Chat>(`/api/chats/${id}`, { method: 'PATCH', ...json(body) }),
  deleteChat: (id: string) => request<{ ok: boolean }>(`/api/chats/${id}`, { method: 'DELETE' }),
  sendMessage: (
    id: string,
    body: { content: string; agentId?: string; providerId?: string; model?: string; fileIds?: string[] },
  ) =>
    request<{ run?: Run; queued?: boolean; item?: QueuedMessage; chatId: string }>(
      `/api/chats/${id}/messages`,
      { method: 'POST', ...json(body) },
    ),
  cancelChat: (id: string) =>
    request<{ ok: boolean; cleared: number }>(`/api/chats/${id}/cancel`, { method: 'POST' }),
  cancelRun: (id: string) => request<{ ok: boolean }>(`/api/runs/${id}/cancel`, { method: 'POST' }),
  removeQueuedMessage: (id: string) =>
    request<{ ok: boolean; chatId: string }>(`/api/queue/${id}`, { method: 'DELETE' }),

  uploadChatFile: (chatId: string, file: File) => {
    const form = new FormData()
    form.append('file', file, file.name)
    return request<ChatFile>(`/api/chats/${chatId}/files`, { method: 'POST', body: form })
  },
  deleteChatFile: (fileId: string) =>
    request<{ ok: boolean }>(`/api/files/${fileId}`, { method: 'DELETE' }),
  previewChatFile: (fileId: string) =>
    request<PreviewPayload>(`/api/files/${fileId}/preview`),
  chatFileBlob: (fileId: string) => fetchBlob(`/api/files/${fileId}?inline=1`),
  downloadChatFile: async (file: { id: string; name: string }) => {
    saveBlob(await fetchBlob(`/api/files/${file.id}`), file.name)
  },

  workspaceFiles: (projectId: string) =>
    request<{ root: string; files: WorkspaceFile[] }>(`/api/projects/${projectId}/files`),
  artifacts: (projectId: string) =>
    request<{ artifacts: Artifact[] }>(`/api/projects/${projectId}/artifacts`),
  previewWorkspaceFile: (projectId: string, filePath: string) =>
    request<PreviewPayload>(
      `/api/projects/${projectId}/preview?path=${encodeURIComponent(filePath)}`,
    ),
  workspaceFileBlob: (projectId: string, filePath: string) =>
    fetchBlob(`/api/projects/${projectId}/file?path=${encodeURIComponent(filePath)}`),
  downloadWorkspaceFile: async (projectId: string, filePath: string, name: string) => {
    saveBlob(await fetchBlob(`/api/projects/${projectId}/file?path=${encodeURIComponent(filePath)}`), name)
  },

  createProvider: (body: Partial<Provider> & { apiKey?: string }) =>
    request<Provider>('/api/providers', { method: 'POST', ...json(body) }),  updateProvider: (id: string, body: Partial<Provider> & { apiKey?: string }) =>
    request<Provider>(`/api/providers/${id}`, { method: 'PATCH', ...json(body) }),
  deleteProvider: (id: string) => request<{ ok: boolean }>(`/api/providers/${id}`, { method: 'DELETE' }),

  mcpServers: () =>
    request<{
      servers: McpServer[]
      activepieces?: { uiUrl?: string; mcpUrl?: string }
    }>('/api/mcp'),
  createMcpServer: (
    body: Partial<McpServer> & {
      name: string
      transport: 'stdio' | 'http'
      env?: Record<string, string>
      headers?: Record<string, string>
    },
  ) => request<McpServer>('/api/mcp', { method: 'POST', ...json(body) }),
  updateMcpServer: (
    id: string,
    body: Partial<McpServer> & {
      env?: Record<string, string>
      headers?: Record<string, string>
      clearCredentials?: boolean
    },
  ) => request<McpServer>(`/api/mcp/${id}`, { method: 'PATCH', ...json(body) }),
  deleteMcpServer: (id: string) => request<{ ok: boolean }>(`/api/mcp/${id}`, { method: 'DELETE' }),
  startMcpOAuth: (id: string, redirectBaseUrl: string) =>
    request<{ authorizationUrl: string }>(`/api/mcp/oauth/start/${id}`, {
      method: 'POST',
      ...json({ redirectBaseUrl }),
    }),
  disconnectMcpOAuth: (id: string) =>
    request<{ ok: boolean }>(`/api/mcp/${id}/oauth/disconnect`, { method: 'POST' }),
  testMcpServer: (id: string) =>
    request<{
      ok: boolean
      tools: Array<{ name: string; description: string; inputSchema?: unknown }>
    }>(`/api/mcp/${id}/test`, { method: 'POST' }),
  fetchModels: (id: string) =>
    request<{ models: string[]; count: number }>(`/api/providers/${id}/models`, { method: 'POST' }),
  testProvider: (id: string) =>
    request<{ ok: boolean; message: string }>(`/api/providers/${id}/test`, { method: 'POST' }),
  probeProvider: (body: Partial<Provider> & { apiKey?: string; providerId?: string; kind?: string }) =>
    request<{ ok: boolean; message: string }>('/api/providers/probe', { method: 'POST', ...json(body) }),
  discoverProviderModels: (body: Partial<Provider> & { apiKey?: string; providerId?: string; kind?: string }) =>
    request<{ models: string[]; count: number }>('/api/providers/discover', {
      method: 'POST',
      ...json(body),
    }),

  createProject: (body: Partial<Project>) =>
    request<Project>('/api/projects', { method: 'POST', ...json(body) }),
  updateProject: (id: string, body: Partial<Project>) =>
    request<Project>(`/api/projects/${id}`, { method: 'PATCH', ...json(body) }),
  reorderProjects: (ids: string[]) =>
    request<{ projects: Project[] }>('/api/projects/reorder', {
      method: 'POST',
      ...json({ ids }),
    }),
  deleteProject: (id: string) => request<{ ok: boolean }>(`/api/projects/${id}`, { method: 'DELETE' }),

  createAgent: (body: Partial<Agent> & { projectId: string }) =>
    request<Agent>('/api/agents', { method: 'POST', ...json(body) }),
  updateAgent: (id: string, body: Partial<Agent>) =>
    request<Agent>(`/api/agents/${id}`, { method: 'PATCH', ...json(body) }),
  deleteAgent: (id: string) => request<{ ok: boolean }>(`/api/agents/${id}`, { method: 'DELETE' }),
  openAgentChat: (id: string) =>
    request<Chat>(`/api/agents/${id}/chat`, { method: 'POST' }),

  memory: (projectId: string) => request<MemoryGraph>(`/api/projects/${projectId}/memory`),
  createMemoryLink: (projectId: string, agentA: string, agentB: string) =>
    request<{ id: string }>(`/api/projects/${projectId}/links`, {
      method: 'POST',
      ...json({ agentA, agentB }),
    }),
  deleteMemoryLink: (linkId: string) =>
    request<{ ok: boolean }>(`/api/links/${linkId}`, { method: 'DELETE' }),

  updateSettings: (body: Record<string, unknown>) =>
    request<Record<string, any>>('/api/settings', { method: 'PATCH', ...json(body) }),
}
