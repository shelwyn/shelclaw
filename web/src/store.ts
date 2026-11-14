import { create } from 'zustand'
import { api, ApiError, getToken, setToken } from './api'
import type {
  Agent,
  AgentMemory,
  AppSettings,
  Bootstrap,
  BusEvent,
  Chat,
  ChatDetail,
  MemoryGraph,
  Message,
  PreviewTarget,
  Project,
  Provider,
  Run,
  Task,
} from './types'

export type ModalState =
  | { type: 'settings'; tab?: 'providers' | 'workspace' | 'mcp' | 'activepieces' }
  | { type: 'agent'; id?: string }
  | { type: 'project'; id?: string }
  | null

export type InspectorTab = 'orchestration' | 'memory' | 'artifacts'

export interface Toast {
  id: string
  level: 'info' | 'success' | 'error'
  message: string
}

const defaultSettings: AppSettings = {
  defaultProviderId: '',
  defaultModel: '',
  maxDepth: 3,
  maxParallel: 4,
  maxAgents: 24,
  maxSteps: 8,
  workspaceName: 'OpenCodex',
  autoTitle: true,
}

export function initialTheme(): 'light' | 'dark' {
  try {
    const stored = localStorage.getItem('ocx.theme')
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // ignore
  }
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

export function applyTheme(theme: 'light' | 'dark'): void {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  try {
    localStorage.setItem('ocx.theme', theme)
  } catch {
    // ignore
  }
}

interface AppState {
  ready: boolean
  booting: boolean
  bootError: string
  needsAuth: boolean
  authError: string
  connected: boolean

  providers: Provider[]
  projects: Project[]
  agents: Agent[]
  chats: Chat[]
  settings: AppSettings
  activeRuns: Run[]

  activeChatId: string
  detail: ChatDetail | null
  loadingChat: boolean
  sending: boolean

  activeProjectId: string
  inspectorTab: InspectorTab
  memory: MemoryGraph | null
  memoryLoading: boolean
  search: string
  archivedView: boolean
  inspectorOpen: boolean
  previewOpen: boolean
  previewTarget: PreviewTarget | null
  unreadChatIds: string[]
  artifactsChangedAt: number
  activityByChat: Record<string, string>
  scrollRequest: number
  sidebarOpen: boolean
  sidebarCollapsed: boolean
  theme: 'light' | 'dark'
  modal: ModalState
  toasts: Toast[]
  drafts: Record<string, string>

  init: () => Promise<void>
  retry: () => void
  submitToken: (token: string) => Promise<void>
  refresh: () => Promise<void>
  refreshDetail: (chatId?: string) => Promise<void>

  openChat: (id: string) => Promise<void>
  goHome: () => void
  newChat: (opts?: { agentId?: string; projectId?: string; title?: string }) => Promise<string | null>
  openAgentChat: (agentId: string) => Promise<string | null>
  deleteChat: (id: string) => Promise<void>
  renameChat: (id: string, title: string) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  reorderProjects: (ids: string[]) => Promise<void>
  toggleProjectPin: (id: string) => Promise<void>
  send: (content: string, fileIds?: string[]) => Promise<boolean>
  requestScrollToBottom: () => void
  removeQueuedMessage: (id: string) => Promise<void>
  stop: () => Promise<void>
  updateChat: (patch: Partial<Chat>) => Promise<void>
  selectAgent: (agentId: string) => Promise<void>
  selectModel: (providerId: string, model: string) => Promise<void>

  setActiveProject: (projectId: string) => void
  setInspectorTab: (tab: InspectorTab) => void
  openPreview: (target: PreviewTarget) => void
  openFilesPanel: () => void
  openArtifactsPanel: (projectId?: string) => void
  closePreview: () => void
  markUnread: (chatId: string) => void
  clearUnread: (chatId: string) => void
  clearUnreadForAgent: (agentId: string) => void
  openMemory: (projectId?: string) => Promise<void>
  refreshMemory: () => Promise<void>
  createMemoryLink: (agentA: string, agentB: string) => Promise<void>
  removeMemoryLink: (linkId: string) => Promise<void>
  setSearch: (search: string) => void
  setArchivedView: (archived: boolean) => void
  archiveChat: (id: string, archived: boolean) => Promise<void>
  toggleInspector: () => void
  setSidebarOpen: (open: boolean) => void
  toggleSidebarCollapsed: () => void
  toggleTheme: () => void
  openModal: (modal: ModalState) => void
  closeModal: () => void
  toast: (level: Toast['level'], message: string) => void
  dismissToast: (id: string) => void
  setDraft: (chatId: string, text: string) => void
}

const emptyDetail = (chat: Chat): ChatDetail => ({
  chat,
  messages: [],
  tasks: [],
  runs: [],
  files: [],
  queue: [],
  usage: { input: 0, output: 0, total: 0, cost: 0 },
  context: { usedTokens: 0, limitTokens: 0, percent: 0 },
  orchestrationRunId: '',
  activeRunId: '',
})

function upsertById<T extends { id: string }>(items: T[], item: T): T[] {
  const index = items.findIndex((entry) => entry.id === item.id)
  if (index === -1) return [item, ...items]
  const next = items.slice()
  next[index] = { ...next[index], ...item }
  return next
}

function upsertTask(tasks: Task[], task: Task): Task[] {
  return upsertById(tasks, task).sort((a, b) => a.createdAt - b.createdAt)
}

function pushToast(level: Toast['level'], message: string): void {
  const id = crypto.randomUUID()
  useAppStore.setState((state) => ({ toasts: [...state.toasts, { id, level, message }] }))
  setTimeout(() => {
    useAppStore.setState((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }))
  }, level === 'error' ? 7000 : 4000)
}

function errorText(err: unknown): string {
  if (err instanceof ApiError) return err.message
  if (err instanceof Error) return err.message
  return String(err)
}

function loadUnreadChats(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem('ocx.unread') || '[]')
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

function persistUnreadChats(chatIds: string[]): void {
  try {
    localStorage.setItem('ocx.unread', JSON.stringify(chatIds))
  } catch {
    // ignore
  }
}

function loadSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem('ocx.sidebarCollapsed') === '1'
  } catch {
    return false
  }
}

function parseHashChat(): string {
  const match = window.location.hash.match(/^#\/chat\/([^/?#]+)/)
  return match ? decodeURIComponent(match[1]) : ''
}

let eventSource: EventSource | null = null
let refreshTimer: ReturnType<typeof setTimeout> | null = null
let initPromise: Promise<void> | null = null

function scheduleRefresh(delay = 450): void {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    refreshTimer = null
    void useAppStore.getState().refresh()
  }, delay)
}

function isDescendantOf(chats: Chat[], candidateId: string, ancestorId: string): boolean {
  let current = chats.find((chat) => chat.id === candidateId)
  let guard = 0
  while (current?.parentChatId && guard++ < 50) {
    if (current.parentChatId === ancestorId) return true
    current = chats.find((chat) => chat.id === current!.parentChatId)
  }
  return false
}

function connectEvents(): void {
  eventSource?.close()
  const token = getToken()
  const source = new EventSource(`/api/events${token ? `?token=${encodeURIComponent(token)}` : ''}`)
  eventSource = source
  source.onopen = () => {
    useAppStore.setState({ connected: true })
    scheduleRefresh(300)
  }
  source.onerror = () => useAppStore.setState({ connected: false })
  source.onmessage = (event) => {
    try {
      handleEvent(JSON.parse(event.data) as BusEvent)
    } catch {
      // ignore malformed frames
    }
  }
}

function handleEvent(event: BusEvent): void {
  const state = useAppStore.getState()

  switch (event.type) {
    case 'message.created': {
      const message = event.message as Message
      if (!message) return
      if (state.detail?.chat.id === message.chatId) {
        if (!state.detail.messages.some((entry) => entry.id === message.id)) {
          useAppStore.setState({
            detail: { ...state.detail, messages: [...state.detail.messages, message] },
          })
        }
      }
      if (message.role === 'agent') {
        useAppStore.getState().markUnread(message.chatId)
        scheduleRefresh(250)
        if (state.inspectorTab === 'memory') void state.refreshMemory()
        const meta = (message.metadata || {}) as Record<string, unknown>
        if (state.activeChatId !== message.chatId) {
          pushToast(
            'info',
            `${message.name || 'Agent'} finished${meta.title ? `: ${String(meta.title)}` : ' a task'}`,
          )
        }
      }
      if (message.role === 'user') scheduleRefresh(250)
      break
    }

    case 'message.delta': {
      const { chatId, messageId, delta, kind } = event as unknown as {
        chatId: string
        messageId: string
        delta: string
        kind: 'text' | 'reasoning'
      }
      if (!state.detail || state.detail.chat.id !== chatId) return
      useAppStore.setState((current) => {
        if (!current.detail) return current
        const messages = current.detail.messages.map((message) => {
          if (message.id !== messageId) return message
          return kind === 'reasoning'
            ? { ...message, reasoning: message.reasoning + delta, status: 'streaming' as const }
            : { ...message, content: message.content + delta, status: 'streaming' as const }
        })
        return { detail: { ...current.detail, messages } }
      })
      break
    }

    case 'message.completed': {
      const message = event.message as Message
      if (!message) return
      if (state.detail?.chat.id === message.chatId) {
        useAppStore.setState((current) => {
          if (!current.detail) return current
          const exists = current.detail.messages.some((entry) => entry.id === message.id)
          const messages = exists
            ? current.detail.messages.map((entry) => (entry.id === message.id ? message : entry))
            : [...current.detail.messages, message]
          return { detail: { ...current.detail, messages } }
        })
      }
      if (message.role === 'assistant') scheduleRefresh(400)
      break
    }

    case 'task.created':
    case 'task.updated': {
      const task = event.task as Task
      if (!task) return
      const childChat = event.chat as Chat | undefined
      if (state.detail && task.rootChatId === state.detail.chat.rootChatId) {
        useAppStore.setState((current) => {
          if (!current.detail) return current
          return {
            detail: {
              ...current.detail,
              tasks: upsertTask(current.detail.tasks, task),
              orchestrationRunId: current.detail.orchestrationRunId || task.rootRunId,
            },
          }
        })
      }
      if (childChat) {
        useAppStore.setState((current) => ({ chats: upsertById(current.chats, childChat) }))
      }
      scheduleRefresh(350)
      break
    }

    case 'chat.updated': {
      const chat = event.chat as Chat
      if (!chat) return
      useAppStore.setState((current) => ({
        chats: upsertById(current.chats, chat),
        detail:
          current.detail && current.detail.chat.id === chat.id
            ? { ...current.detail, chat }
            : current.detail,
      }))
      break
    }

    case 'chats.changed':
      scheduleRefresh(250)
      break

    case 'queue.changed': {
      const chatId = String(event.chatId || '')
      if (chatId && state.activeChatId === chatId) {
        void useAppStore.getState().refreshDetail(chatId)
      }
      break
    }

    case 'artifacts.changed':
      useAppStore.setState((current) => ({ artifactsChangedAt: current.artifactsChangedAt + 1 }))
      break

    case 'activity.changed': {
      const chatId = String(event.chatId || '')
      const label = String(event.label || '')
      if (!chatId) break
      useAppStore.setState((current) => {
        const next = { ...current.activityByChat }
        if (label) next[chatId] = label
        else delete next[chatId]
        return { activityByChat: next }
      })
      break
    }

    case 'settings.changed':
      void state.refresh()
      break

    case 'agents.changed':
      scheduleRefresh(200)
      break

    case 'memory.changed':
      if (state.inspectorTab === 'memory') void state.refreshMemory()
      break

    case 'run.created': {
      const run = event.run as Run
      if (!run) return
      useAppStore.setState((current) => ({
        activeRuns: [...current.activeRuns.filter((entry) => entry.id !== run.id), run],
        detail:
          current.detail && current.detail.chat.id === run.chatId
            ? {
                ...current.detail,
                activeRunId: run.id,
                orchestrationRunId: run.rootRunId,
              }
            : current.detail,
      }))
      break
    }

    case 'run.updated': {
      const run = event.run as Run
      if (!run) return
      useAppStore.setState((current) => ({
        activeRuns:
          run.status === 'running'
            ? [...current.activeRuns.filter((entry) => entry.id !== run.id), run]
            : current.activeRuns.filter((entry) => entry.id !== run.id),
        detail:
          current.detail && current.detail.chat.id === run.chatId
            ? {
                ...current.detail,
                activeRunId: run.status === 'running' ? run.id : '',
              }
            : current.detail,
      }))
      if (run.status !== 'running') useAppStore.getState().markUnread(run.chatId)
      if (run.status !== 'running') {
        useAppStore.setState((current) => {
          if (!current.activityByChat[run.chatId]) return current
          const next = { ...current.activityByChat }
          delete next[run.chatId]
          return { activityByChat: next }
        })
      }
      if (run.status !== 'running' && state.activeChatId === run.chatId) {
        setTimeout(() => {
          if (useAppStore.getState().activeChatId === run.chatId) {
            void useAppStore.getState().refreshDetail(run.chatId)
          }
        }, 250)
      }
      if (run.status !== 'running') scheduleRefresh(300)
      break
    }

    case 'toast': {
      const level = (event.level as Toast['level']) || 'info'
      if (event.message) pushToast(level, String(event.message))
      break
    }
  }
}

async function doInit(): Promise<void> {
  useAppStore.setState({ booting: true, bootError: '' })
  try {
    const data = await api.bootstrap()
    const theme = initialTheme()
    applyTheme(theme)
    useAppStore.setState({
      ready: true,
      booting: false,
      needsAuth: false,
      authError: '',
      bootError: '',
      providers: data.providers,
      projects: data.projects,
      agents: data.agents,
      chats: data.chats,
      settings: data.settings,
      activeRuns: data.activeRuns,
      theme,
    })
    connectEvents()

    const fromHash = parseHashChat()
    const hashChat = fromHash ? data.chats.find((chat) => chat.id === fromHash) : undefined
    const remembered = (() => {
      try {
        return localStorage.getItem('ocx.project') || ''
      } catch {
        return ''
      }
    })()
    const projectId =
      hashChat?.projectId ||
      data.projects.find((project) => project.id === remembered)?.id ||
      data.projects[0]?.id ||
      ''

    useAppStore.setState({ activeProjectId: projectId })
    if (projectId) {
      try {
        localStorage.setItem('ocx.project', projectId)
      } catch {
        // ignore
      }
    }

    const target =
      hashChat?.id ||
      data.chats.find(
        (chat) =>
          chat.projectId === projectId &&
          !chat.archivedAt &&
          (chat.kind === 'root' || chat.kind === 'direct'),
      )?.id
    if (target) {
      await useAppStore.getState().openChat(target).catch(() => {
        window.history.replaceState(null, '', window.location.pathname)
      })
    }
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      useAppStore.setState({
        needsAuth: true,
        ready: false,
        booting: false,
        authError: getToken()
          ? 'That access token was not accepted. Check APP_TOKEN on the server.'
          : '',
      })
    } else {
      useAppStore.setState({ bootError: errorText(err), booting: false })
    }
    initPromise = null
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  booting: true,
  bootError: '',
  needsAuth: false,
  authError: '',
  connected: false,

  providers: [],
  projects: [],
  agents: [],
  chats: [],
  settings: defaultSettings,
  activeRuns: [],

  activeChatId: '',
  detail: null,
  loadingChat: false,
  sending: false,

  activeProjectId: '',
  inspectorTab: 'orchestration',
  memory: null,
  memoryLoading: false,
  search: '',
  archivedView: false,
  inspectorOpen: typeof window !== 'undefined' ? window.innerWidth >= 1280 : true,
  previewOpen: false,
  previewTarget: null,
  unreadChatIds: typeof window !== 'undefined' ? loadUnreadChats() : [],
  artifactsChangedAt: 0,
  activityByChat: {},
  scrollRequest: 0,
  sidebarOpen: false,
  sidebarCollapsed: typeof window !== 'undefined' ? loadSidebarCollapsed() : false,
  theme: initialTheme(),
  modal: null,
  toasts: [],
  drafts: {},

  init: () => {
    if (!initPromise) initPromise = doInit()
    return initPromise
  },

  retry: () => {
    initPromise = null
    void get().init()
  },

  submitToken: async (token: string) => {
    setToken(token.trim())
    initPromise = null
    await get().init()
  },

  refresh: async () => {
    try {
      const data = await api.bootstrap()
      set((state) => {
        const active = data.chats.find((chat) => chat.id === state.detail?.chat.id)
        const projectStillExists = data.projects.some(
          (project) => project.id === state.activeProjectId,
        )
        const activeProjectId = projectStillExists
          ? state.activeProjectId
          : data.projects[0]?.id || ''
        return {
          providers: data.providers,
          projects: data.projects,
          agents: data.agents,
          chats: data.chats,
          settings: data.settings,
          activeRuns: data.activeRuns,
          activeProjectId,
          activeChatId:
            state.detail && !active ? '' : state.activeChatId,
          detail:
            state.detail && active
              ? { ...state.detail, chat: active }
              : state.detail && !active
                ? null
                : state.detail,
        }
      })
      if (get().inspectorTab === 'memory') void get().refreshMemory()
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        set({ needsAuth: true, ready: false })
      }
    }
  },

  refreshDetail: async (chatId?: string) => {
    const id = chatId || get().activeChatId
    if (!id) return
    try {
      const detail = await api.chat(id)
      if (get().activeChatId === id) set({ detail, loadingChat: false })
    } catch (err) {
      pushToast('error', errorText(err))
    }
  },

  openChat: async (id: string) => {
    const known = get().chats.find((chat) => chat.id === id)
    set({
      activeChatId: id,
      loadingChat: true,
      sidebarOpen: false,
      ...(known ? { activeProjectId: known.projectId } : {}),
    })
    get().clearUnread(id)
    window.history.replaceState(null, '', `#/chat/${id}`)
    try {
      const detail = await api.chat(id)
      if (get().activeChatId === id) {
        set({ detail, loadingChat: false, activeProjectId: detail.chat.projectId })
        try {
          localStorage.setItem('ocx.project', detail.chat.projectId)
        } catch {
          // ignore
        }
      }
    } catch (err) {
      set({ loadingChat: false })
      pushToast('error', errorText(err))
    }
  },

  goHome: () => {
    set({ activeChatId: '', detail: null, loadingChat: false, sidebarOpen: false })
    window.history.replaceState(null, '', window.location.pathname)
  },

  newChat: async (opts = {}) => {
    const state = get()
    const projectId = opts.projectId ?? state.activeProjectId
    if (!projectId) {
      pushToast('info', 'Create a project first, then add agents and chats under it.')
      set({ modal: { type: 'project' } })
      return null
    }
    try {
      const chat = await api.createChat({
        projectId,
        agentId: opts.agentId,
        title: opts.title,
      })
      set((current) => ({
        chats: [chat, ...current.chats],
        activeChatId: chat.id,
        activeProjectId: chat.projectId,
        detail: emptyDetail(chat),
        loadingChat: false,
        archivedView: false,
        sidebarOpen: false,
      }))
      try {
        localStorage.setItem('ocx.project', chat.projectId)
      } catch {
        // ignore
      }
      window.history.replaceState(null, '', `#/chat/${chat.id}`)
      return chat.id
    } catch (err) {
      pushToast('error', errorText(err))
      return null
    }
  },

  openAgentChat: async (agentId: string) => {
    try {
      const chat = await api.openAgentChat(agentId)
      set((current) => ({
        chats: upsertById(current.chats, chat),
        activeProjectId: chat.projectId,
        archivedView: false,
        sidebarOpen: false,
      }))
      await get().openChat(chat.id)
      return chat.id
    } catch (err) {
      pushToast('error', errorText(err))
      return null
    }
  },

  deleteChat: async (id: string) => {
    const state = get()
    try {
      await api.deleteChat(id)
      const removesActive =
        state.activeChatId === id || isDescendantOf(state.chats, state.activeChatId, id)
      set((current) => ({
        chats: current.chats.filter(
          (chat) => chat.id !== id && !isDescendantOf(current.chats, chat.id, id),
        ),
        ...(removesActive
          ? {
              activeChatId: '',
              detail: null,
              drafts: {},
            }
          : {}),
      }))
      if (removesActive) {
        window.history.replaceState(null, '', window.location.pathname)
      }
      void get().refresh()
    } catch (err) {
      pushToast('error', errorText(err))
    }
  },

  deleteProject: async (id: string) => {
    const wasActive = get().activeProjectId === id
    try {
      await api.deleteProject(id)
      set({ previewOpen: false, previewTarget: null })
      await get().refresh()
      if (wasActive) {
        const remaining = get().projects
        if (remaining[0]) get().setActiveProject(remaining[0].id)
        else {
          get().setActiveProject('')
          get().goHome()
        }
      }
      pushToast('success', 'Project deleted.')
    } catch (err) {
      pushToast('error', errorText(err))
    }
  },

  renameChat: async (id: string, title: string) => {
    const next = title.trim()
    if (!next) return
    try {
      const chat = await api.patchChat(id, { title: next })
      set((state) => ({
        chats: upsertById(state.chats, chat),
        detail:
          state.detail && state.detail.chat.id === chat.id
            ? { ...state.detail, chat }
            : state.detail,
      }))
    } catch (err) {
      pushToast('error', errorText(err))
    }
  },

  reorderProjects: async (ids: string[]) => {
    const byId = new Map(get().projects.map((project) => [project.id, project]))
    const optimistic = ids
      .map((id) => byId.get(id))
      .filter((project): project is NonNullable<typeof project> => Boolean(project))
    if (optimistic.length) set({ projects: optimistic })
    try {
      const result = await api.reorderProjects(ids)
      set({ projects: result.projects })
    } catch (err) {
      pushToast('error', errorText(err))
      void get().refresh()
    }
  },

  toggleProjectPin: async (id: string) => {
    const project = get().projects.find((entry) => entry.id === id)
    if (!project) return
    try {
      await api.updateProject(id, { pinned: !project.pinned })
      await get().refresh()
    } catch (err) {
      pushToast('error', errorText(err))
    }
  },

  send: async (content: string, fileIds?: string[]) => {
    const state = get()
    const chatId = state.activeChatId
    if (!chatId) return false
    const chat = state.detail?.chat || state.chats.find((entry) => entry.id === chatId)
    if (!chat) return false
    const alreadyRunning = state.activeRuns.some((run) => run.chatId === chatId)
    set({ sending: true })
    try {
      const result = await api.sendMessage(chatId, {
        content,
        agentId: chat.agentId,
        providerId: chat.providerId,
        model: chat.model,
        fileIds: fileIds?.length ? fileIds : undefined,
      })
      set((current) => ({
        drafts: { ...current.drafts, [chatId]: '' },
        scrollRequest: current.scrollRequest + 1,
      }))
      if (result.queued) {
        pushToast('info', 'Message queued. It will send when this run finishes.')
        void get()
          .refreshDetail(chatId)
          .then(() => get().requestScrollToBottom())
      }
      return true
    } catch (err) {
      pushToast('error', errorText(err))
      if (alreadyRunning) void get().refreshDetail(chatId)
      return false
    } finally {
      set({ sending: false })
    }
  },

  requestScrollToBottom: () =>
    set((state) => ({ scrollRequest: state.scrollRequest + 1 })),

  removeQueuedMessage: async (id: string) => {
    set((state) =>
      state.detail
        ? { detail: { ...state.detail, queue: state.detail.queue.filter((item) => item.id !== id) } }
        : {},
    )
    try {
      const result = await api.removeQueuedMessage(id)
      if (get().activeChatId === result.chatId) void get().refreshDetail(result.chatId)
    } catch (err) {
      pushToast('error', errorText(err))
      const chatId = get().activeChatId
      if (chatId) void get().refreshDetail(chatId)
    }
  },

  stop: async () => {
    const chatId = get().activeChatId
    if (!chatId) return
    try {
      const result = await api.cancelChat(chatId)
      if (result.cleared) pushToast('info', 'Stopped. Queued messages were cleared.')
      void get().refreshDetail(chatId)
    } catch (err) {
      pushToast('error', errorText(err))
    }
  },

  updateChat: async (patch: Partial<Chat>) => {
    const chatId = get().activeChatId
    if (!chatId) return
    try {
      const chat = await api.patchChat(chatId, patch)
      set((state) => ({
        chats: upsertById(state.chats, chat),
        detail:
          state.detail && state.detail.chat.id === chat.id
            ? { ...state.detail, chat }
            : state.detail,
      }))
    } catch (err) {
      pushToast('error', errorText(err))
    }
  },

  selectAgent: async (agentId: string) => {
    const agent = get().agents.find((entry) => entry.id === agentId)
    const patch: Partial<Chat> = { agentId }
    if (agent?.providerId) patch.providerId = agent.providerId
    if (agent?.model) patch.model = agent.model
    await get().updateChat(patch)
  },

  selectModel: async (providerId: string, model: string) => {
    await get().updateChat({ providerId, model })
  },

  setArchivedView: (archivedView) => set({ archivedView, search: '' }),

  setActiveProject: (projectId) => {
    const state = get()
    if (state.activeProjectId === projectId) {
      set({ sidebarOpen: false, archivedView: false })
      return
    }
    set({
      activeProjectId: projectId,
      activeChatId: '',
      detail: null,
      loadingChat: false,
      archivedView: false,
      search: '',
      sidebarOpen: false,
      memory: null,
      previewOpen: false,
      previewTarget: null,
    })
    try {
      localStorage.setItem('ocx.project', projectId)
    } catch {
      // ignore
    }
    window.history.replaceState(null, '', window.location.pathname)
    if (get().inspectorOpen && get().inspectorTab === 'memory') void get().refreshMemory()
  },

  setInspectorTab: (inspectorTab) => {
    set({ inspectorTab, inspectorOpen: true, sidebarOpen: false })
    if (inspectorTab === 'memory' && !get().memory) void get().refreshMemory()
  },

  openPreview: (target) => set({ previewTarget: target, previewOpen: true, sidebarOpen: false }),

  openFilesPanel: () =>
    set({ previewTarget: null, previewOpen: true, sidebarOpen: false }),

  openArtifactsPanel: (projectId) => {
    const state = get()
    const id = projectId || state.activeProjectId
    if (!id) return
    const sameProject = state.activeProjectId === id
    set({
      activeProjectId: id,
      inspectorTab: 'artifacts',
      inspectorOpen: true,
      sidebarOpen: false,
      ...(sameProject ? {} : { activeChatId: '', detail: null, loadingChat: false }),
    })
  },

  closePreview: () => set({ previewOpen: false, previewTarget: null }),

  markUnread: (chatId) => {
    set((state) => {
      if (!chatId || state.activeChatId === chatId || state.unreadChatIds.includes(chatId)) {
        return state
      }
      const next = [...state.unreadChatIds, chatId]
      persistUnreadChats(next)
      return { unreadChatIds: next }
    })
  },

  clearUnread: (chatId) => {
    set((state) => {
      if (!state.unreadChatIds.includes(chatId)) return state
      const next = state.unreadChatIds.filter((id) => id !== chatId)
      persistUnreadChats(next)
      return { unreadChatIds: next }
    })
  },

  clearUnreadForAgent: (agentId) => {
    set((state) => {
      const agentChatIds = new Set(
        state.chats.filter((chat) => chat.agentId === agentId).map((chat) => chat.id),
      )
      const next = state.unreadChatIds.filter((id) => !agentChatIds.has(id))
      if (next.length === state.unreadChatIds.length) return state
      persistUnreadChats(next)
      return { unreadChatIds: next }
    })
  },

  openMemory: async (projectId) => {
    const state = get()
    const id = projectId || state.activeProjectId
    if (!id) return
    const sameProject = state.activeProjectId === id
    set({
      activeProjectId: id,
      inspectorTab: 'memory',
      inspectorOpen: true,
      ...(sameProject ? {} : { activeChatId: '', detail: null }),
      archivedView: false,
      sidebarOpen: false,
    })
    try {
      localStorage.setItem('ocx.project', id)
    } catch {
      // ignore
    }
    if (!sameProject) {
      window.history.replaceState(null, '', window.location.pathname)
    }
    await get().refreshMemory()
  },

  refreshMemory: async () => {
    const projectId = get().activeProjectId
    if (!projectId) {
      set({ memory: null })
      return
    }
    set({ memoryLoading: true })
    try {
      const graph = await api.memory(projectId)
      if (get().activeProjectId === projectId) set({ memory: graph, memoryLoading: false })
    } catch (err) {
      set({ memoryLoading: false })
      pushToast('error', errorText(err))
    }
  },

  createMemoryLink: async (agentA, agentB) => {
    const projectId = get().activeProjectId
    if (!projectId) return
    try {
      await api.createMemoryLink(projectId, agentA, agentB)
      await get().refreshMemory()
      pushToast('success', 'Memory linked.')
    } catch (err) {
      pushToast('error', errorText(err))
    }
  },

  removeMemoryLink: async (linkId) => {
    try {
      await api.deleteMemoryLink(linkId)
      await get().refreshMemory()
      pushToast('success', 'Memory link removed.')
    } catch (err) {
      pushToast('error', errorText(err))
    }
  },

  archiveChat: async (id: string, archived: boolean) => {
    const state = get()
    try {
      await api.patchChat(id, { archived })
      const shouldLeave =
        archived &&
        (state.activeChatId === id || isDescendantOf(state.chats, state.activeChatId, id))
      if (shouldLeave) {
        set({ activeChatId: '', detail: null, loadingChat: false })
        window.history.replaceState(null, '', window.location.pathname)
      }
      await get().refresh()
      pushToast('success', archived ? 'Chat archived.' : 'Chat restored.')
    } catch (err) {
      pushToast('error', errorText(err))
    }
  },

  setSearch: (search) => set({ search }),
  toggleInspector: () => set((state) => ({ inspectorOpen: !state.inspectorOpen })),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),

  toggleSidebarCollapsed: () => {
    set((state) => {
      const next = !state.sidebarCollapsed
      try {
        localStorage.setItem('ocx.sidebarCollapsed', next ? '1' : '0')
      } catch {
        // ignore
      }
      return { sidebarCollapsed: next, sidebarOpen: false }
    })
  },

  toggleTheme: () => {
    const theme = get().theme === 'dark' ? 'light' : 'dark'
    applyTheme(theme)
    set({ theme })
  },

  openModal: (modal) => set({ modal }),
  closeModal: () => set({ modal: null }),

  toast: (level, message) => pushToast(level, message),
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
  setDraft: (chatId, text) =>
    set((state) => ({ drafts: { ...state.drafts, [chatId]: text } })),
}))
