import {
  Archive,
  ArrowLeft,
  Brain,
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  FolderKanban,
  MessageSquare,
  Moon,
  Pencil,
  Plus,
  Search,
  Settings,
  Sun,
  Trash2,
  X,
} from 'lucide-react'
import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '../store'
import type { Agent, Chat, Project } from '../types'
import { relativeTime } from '../lib/format'
import { Avatar, Badge, Button, cn, ConfirmDialog, EmptyState, Spinner } from './ui'

function ChatRow({
  chat,
  depth,
  agent,
  active,
  onClick,
  onDelete,
}: {
  chat: Chat
  depth: number
  agent?: Agent
  active: boolean
  onClick: () => void
  onDelete: () => void
}) {
  const running = chat.status === 'running'
  return (
    <div
      className={cn(
        'group flex w-full items-center gap-1 rounded-lg pr-1 transition-colors',
        active ? 'bg-accent-soft text-ink' : 'text-muted hover:bg-panel2 hover:text-ink',
      )}
      style={depth > 0 ? { paddingLeft: 4 + depth * 12 } : undefined}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex min-w-0 flex-1 items-center gap-2 py-[7px] pl-1.5 text-left"
        title={chat.title}
      >
        {depth > 0 ? (
          <CornerDownRight className="h-3 w-3 shrink-0 text-faint" />
        ) : running ? (
          <Spinner className="h-3.5 w-3.5 shrink-0 text-accent" />
        ) : (
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: agent?.color || 'var(--faint)' }}
          />
        )}
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{chat.title}</span>
        <span className="shrink-0 text-[10px] tabular-nums text-faint">
          {running ? 'live' : relativeTime(chat.lastMessageAt)}
        </span>
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          onDelete()
        }}
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-faint opacity-100 transition-opacity hover:bg-danger/10 hover:text-danger md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
        aria-label={`Delete ${chat.title}`}
        title="Delete chat"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  )
}

function ChatBranch({
  chat,
  depth,
  childrenByParent,
  agentMap,
  activeChatId,
  expanded,
  setExpanded,
  openChat,
  onDelete,
}: {
  chat: Chat
  depth: number
  childrenByParent: Map<string, Chat[]>
  agentMap: Map<string, Agent>
  activeChatId: string
  expanded: Record<string, boolean>
  setExpanded: Dispatch<SetStateAction<Record<string, boolean>>>
  openChat: (id: string) => void
  onDelete: (chat: Chat) => void
}) {
  const children = childrenByParent.get(chat.id) || []
  const isExpanded = expanded[chat.id] ?? true
  const shown = isExpanded ? children : children.slice(0, 2)

  return (
    <div>
      <ChatRow
        chat={chat}
        depth={depth}
        agent={agentMap.get(chat.agentId)}
        active={chat.id === activeChatId}
        onClick={() => openChat(chat.id)}
        onDelete={() => onDelete(chat)}
      />
      {children.length ? (
        <div className="relative ml-[15px] border-l border-line/70 pl-1">
          {shown.map((child) => (
            <ChatBranch
              key={child.id}
              chat={child}
              depth={Math.min(depth + 1, 4)}
              childrenByParent={childrenByParent}
              agentMap={agentMap}
              activeChatId={activeChatId}
              expanded={expanded}
              setExpanded={setExpanded}
              openChat={openChat}
              onDelete={onDelete}
            />
          ))}
          {children.length > shown.length ? (
            <button
              type="button"
              onClick={() => setExpanded((current) => ({ ...current, [chat.id]: true }))}
              className="flex items-center gap-1 px-2 py-1 text-[10.5px] text-faint hover:text-accent"
            >
              <ChevronDown className="h-3 w-3" />
              {children.length - shown.length} more sub-agent
              {children.length - shown.length === 1 ? '' : 's'}
            </button>
          ) : null}
          {isExpanded && children.length > 3 ? (
            <button
              type="button"
              onClick={() => setExpanded((current) => ({ ...current, [chat.id]: false }))}
              className="flex items-center gap-1 px-2 py-1 text-[10.5px] text-faint hover:text-accent"
            >
              <ChevronRight className="h-3 w-3" />
              Collapse
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function ProjectRow({
  project,
  active,
  agentCount,
  chatCount,
  onSelect,
  onEdit,
  onMemory,
  memoryActive,
}: {
  project: Project
  active: boolean
  agentCount: number
  chatCount: number
  onSelect: () => void
  onEdit: () => void
  onMemory: () => void
  memoryActive: boolean
}) {
  return (
    <div
      className={cn(
        'group flex w-full items-center gap-1 rounded-lg pr-1 transition-colors',
        active ? 'bg-accent-soft text-ink' : 'text-muted hover:bg-panel2 hover:text-ink',
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-2.5 py-[7px] pl-2 text-left"
        title={project.workspacePath}
      >
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: project.color || 'var(--accent)' }}
        />
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{project.name}</span>
        <span className="shrink-0 text-[9.5px] tabular-nums text-faint">
          {chatCount ? `${agentCount}a · ${chatCount}c` : ''}
        </span>
      </button>
      {active ? (
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex h-6 w-6 items-center justify-center rounded text-faint hover:bg-panel hover:text-ink"
            aria-label="Project settings"
            title={`Project settings · ${project.workspacePath}`}
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={onMemory}
            className={cn(
              'inline-flex h-6 w-6 items-center justify-center rounded',
              memoryActive ? 'text-accent' : 'text-faint hover:bg-panel hover:text-ink',
            )}
            aria-label="Memory links"
            title="Memory links"
          >
            <Brain className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
    </div>
  )
}

function AgentRow({
  agent,
  busyTitle,
  activeChatId,
  onOpen,
  onEdit,
}: {
  agent: Agent
  busyTitle?: string
  activeChatId: string
  onOpen: () => void
  onEdit: () => void
}) {
  const busy = Boolean(busyTitle)
  return (
    <div
      className={cn(
        'group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-panel2',
        busy && 'bg-accent/5',
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        title={`Chat with ${agent.name}`}
      >
        <span className="relative shrink-0">
          <Avatar name={agent.name} color={agent.color} size="sm" />
          {busy ? (
            <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full border border-panel bg-panel">
              <Spinner className="h-2 w-2 text-accent" />
            </span>
          ) : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[12.5px] font-medium text-ink">{agent.name}</span>
            {agent.canSpawn ? <Badge tone="accent">delegates</Badge> : null}
          </span>
          <span
            className={cn(
              'mt-0.5 block truncate text-[10.5px]',
              busy ? 'text-accent' : 'text-faint',
            )}
          >
            {busy ? `working on ${busyTitle}` : agent.model || 'harness default'}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={onEdit}
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-faint opacity-60 transition-opacity hover:bg-panel hover:text-ink group-hover:opacity-100"
        aria-label={`Edit ${agent.name}`}
        title="Agent settings"
      >
        <Settings className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

export function Sidebar() {
  const {
    agents,
    chats,
    projects,
    settings,
    activeChatId,
    activeProjectId,
    inspectorTab,
    inspectorOpen,
    search,
    archivedView,
    sidebarOpen,
    theme,
    connected,
    setActiveProject,
    setSearch,
    setArchivedView,
    setSidebarOpen,
    openChat,
    openAgentChat,
    newChat,
    openMemory,
    openModal,
    toggleTheme,
    goHome,
    deleteChat,
  } = useAppStore(
    useShallow((state) => ({
      agents: state.agents,
      chats: state.chats,
      projects: state.projects,
      settings: state.settings,
      activeChatId: state.activeChatId,
      activeProjectId: state.activeProjectId,
      inspectorTab: state.inspectorTab,
      inspectorOpen: state.inspectorOpen,
      search: state.search,
      archivedView: state.archivedView,
      sidebarOpen: state.sidebarOpen,
      theme: state.theme,
      connected: state.connected,
      setActiveProject: state.setActiveProject,
      setSearch: state.setSearch,
      setArchivedView: state.setArchivedView,
      setSidebarOpen: state.setSidebarOpen,
      openChat: state.openChat,
      openAgentChat: state.openAgentChat,
      newChat: state.newChat,
      openMemory: state.openMemory,
      openModal: state.openModal,
      toggleTheme: state.toggleTheme,
      goHome: state.goHome,
      deleteChat: state.deleteChat,
    })),
  )

  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [deleteTarget, setDeleteTarget] = useState<Chat | null>(null)
  const [deleting, setDeleting] = useState(false)
  const memoryActive = inspectorOpen && inspectorTab === 'memory'
  const activeProject = projects.find((project) => project.id === activeProjectId)
  const projectAgents = useMemo(
    () => agents.filter((agent) => agent.projectId === activeProjectId),
    [agents, activeProjectId],
  )
  const orchestrator = projectAgents.find((agent) => agent.isOrchestrator)
  const userAgents = projectAgents.filter((agent) => !agent.isOrchestrator)
  const projectChats = useMemo(
    () => chats.filter((chat) => chat.projectId === activeProjectId),
    [chats, activeProjectId],
  )
  const agentMap = useMemo(() => new Map(projectAgents.map((agent) => [agent.id, agent])), [projectAgents])

  const busyFor = (agentId: string): string | undefined => {
    const running = projectChats.find(
      (chat) => chat.agentId === agentId && chat.status === 'running' && !chat.archivedAt,
    )
    return running?.title
  }

  const filterChats = (chat: Chat): boolean => {
    if (archivedView ? !chat.archivedAt : Boolean(chat.archivedAt)) return false
    if (!search.trim()) return true
    const query = search.trim().toLowerCase()
    const agent = agentMap.get(chat.agentId)
    return (
      chat.title.toLowerCase().includes(query) ||
      (agent?.name || '').toLowerCase().includes(query)
    )
  }

  const { roots, childrenByParent } = useMemo(() => {
    const visible = projectChats.filter(filterChats)
    const visibleIds = new Set(visible.map((chat) => chat.id))
    const childMap = new Map<string, Chat[]>()
    const roots: Chat[] = []
    for (const chat of visible) {
      if (chat.parentChatId && visibleIds.has(chat.parentChatId)) {
        const list = childMap.get(chat.parentChatId) || []
        list.push(chat)
        childMap.set(chat.parentChatId, list)
      } else {
        roots.push(chat)
      }
    }
    roots.sort((a, b) => b.lastMessageAt - a.lastMessageAt)
    for (const list of childMap.values()) list.sort((a, b) => a.createdAt - b.createdAt)
    return { roots, childrenByParent: childMap }
  }, [projectChats, search, agentMap, archivedView])

  const visibleAgents = userAgents.filter((agent) => {
    if (!search.trim()) return true
    const query = search.toLowerCase()
    return (
      agent.name.toLowerCase().includes(query) ||
      agent.description.toLowerCase().includes(query)
    )
  })
  const archivedCount = projectChats.filter((chat) => chat.archivedAt).length

  const openAgent = (agentId: string) => {
    void openAgentChat(agentId)
    setSidebarOpen(false)
  }

  const openAgentSettings = (agentId: string) => {
    openModal({ type: 'agent', id: agentId })
  }

  const createChat = () => {
    if (!activeProject) {
      openModal({ type: 'project' })
      return
    }
    void newChat()
  }

  const createAgent = () => {
    if (!activeProject) {
      openModal({ type: 'project' })
      return
    }
    openModal({ type: 'agent' })
  }

  return (
    <>
      {sidebarOpen ? (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-[1px] md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-[286px] shrink-0 flex-col border-r border-line bg-panel transition-transform duration-200',
          'md:static md:z-auto md:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
      >
        <div className="flex items-center gap-2.5 px-3 pb-2 pt-3.5">
          <button
            type="button"
            onClick={goHome}
            className="logo-mark flex h-8 w-8 items-center justify-center rounded-[10px] text-white"
            title="Back to home"
          >
            <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 3 4.5 7.2v9.6L12 21l7.5-4.2V7.2L12 3Z" strokeLinejoin="round" />
              <path d="m4.8 7.4 7.2 4.1 7.2-4.1M12 11.5V21" strokeLinejoin="round" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-semibold tracking-[-0.01em] text-ink">
              {settings.workspaceName || 'OpenCodex'}
            </div>
            <div className="text-[10px] text-faint">project-first agent workspace</div>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-panel2 hover:text-ink md:hidden"
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-3 pb-2">
          <Button variant="primary" size="md" className="w-full justify-start" onClick={createChat}>
            <Plus className="h-4 w-4" />
            New chat
          </Button>
        </div>

        <div className="px-3 pb-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search this project"
              className="h-8 w-full rounded-lg border border-line bg-panel2 pl-8 pr-7 text-[12px] text-ink placeholder:text-faint focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/10"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-1.5 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-faint hover:bg-panel hover:text-ink"
                aria-label="Clear search"
              >
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </div>
        </div>

        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          <div className="flex items-center justify-between px-2 pb-1 pt-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.09em] text-faint">
              Projects
            </span>
            <button
              type="button"
              onClick={() => openModal({ type: 'project' })}
              className="inline-flex h-5 w-5 items-center justify-center rounded text-faint hover:bg-panel2 hover:text-ink"
              aria-label="New project"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          {projects.length === 0 ? (
            <EmptyState
              icon={<FolderKanban className="h-4 w-4" />}
              title="Create your first project"
              description="Agents and chats live inside a project."
              action={
                <Button size="sm" variant="secondary" onClick={() => openModal({ type: 'project' })}>
                  <Plus className="h-3.5 w-3.5" /> New project
                </Button>
              }
            />
          ) : (
            <div className="max-h-[148px] space-y-0.5 overflow-y-auto scroll-thin">
              {projects.map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  active={project.id === activeProjectId}
                  agentCount={
                    agents.filter(
                      (agent) => agent.projectId === project.id && !agent.isOrchestrator,
                    ).length
                  }
                  chatCount={
                    chats.filter(
                      (chat) =>
                        chat.projectId === project.id &&
                        !chat.parentChatId &&
                        !chat.archivedAt,
                    ).length
                  }
                  onSelect={() => setActiveProject(project.id)}
                  onEdit={() => openModal({ type: 'project', id: project.id })}
                  onMemory={() => void openMemory(project.id)}
                  memoryActive={project.id === activeProjectId && memoryActive}
                />
              ))}
            </div>
          )}

          {activeProject ? (
            <>
              <div className="mx-2 my-2 border-t border-line" />

              {orchestrator ? (
                <div className="mt-1 rounded-lg border border-line/80 bg-panel2/40 p-1">
                  <div className="flex items-center gap-2 px-1 py-1">
                    <button
                      type="button"
                      onClick={() => openAgent(orchestrator.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      title="Chat with the Orchestrator"
                    >
                      <span className="relative">
                        <Avatar name="O" color={orchestrator.color} size="sm" />
                        {busyFor(orchestrator.id) ? (
                          <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full border border-panel bg-panel">
                            <Spinner className="h-2 w-2 text-accent" />
                          </span>
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[12px] font-semibold text-ink">
                            {orchestrator.name}
                          </span>
                          <Badge tone="accent">plans</Badge>
                        </span>
                        <span className="block truncate text-[9.5px] text-faint">
                          {busyFor(orchestrator.id)
                            ? `working on ${busyFor(orchestrator.id)}`
                            : 'researches, plans, coordinates'}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openAgentSettings(orchestrator.id)}
                      className="inline-flex h-6 w-6 items-center justify-center rounded text-faint hover:bg-panel hover:text-ink"
                      aria-label="Orchestrator settings"
                      title="Orchestrator settings"
                    >
                      <Settings className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="flex items-center justify-between px-2 pb-1 pt-3">
                <span className="text-[10px] font-semibold uppercase tracking-[0.09em] text-faint">
                  Agents
                </span>
                <button
                  type="button"
                  onClick={createAgent}
                  className="inline-flex h-5 w-5 items-center justify-center rounded text-faint hover:bg-panel2 hover:text-ink"
                  aria-label="New agent"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>

              {userAgents.length === 0 ? (
                <div className="mx-1 rounded-lg border border-dashed border-line px-2 py-3 text-center">
                  <p className="text-[10.5px] leading-relaxed text-faint">
                    No agents yet. The Orchestrator can research and plan; add agents to delegate
                    execution.
                  </p>
                  <button
                    type="button"
                    onClick={createAgent}
                    className="mt-1 text-[10.5px] font-medium text-accent hover:underline"
                  >
                    Create agent
                  </button>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {visibleAgents.map((agent) => (
                    <AgentRow
                      key={agent.id}
                      agent={agent}
                      busyTitle={busyFor(agent.id)}
                      activeChatId={activeChatId}
                      onOpen={() => openAgent(agent.id)}
                      onEdit={() => openAgentSettings(agent.id)}
                    />
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between px-2 pb-1 pt-3">
                <span className="text-[10px] font-semibold uppercase tracking-[0.09em] text-faint">
                  Chats
                </span>
                <button
                  type="button"
                  onClick={createChat}
                  className="inline-flex h-5 w-5 items-center justify-center rounded text-faint hover:bg-panel2 hover:text-ink"
                  aria-label="New chat"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>

              {archivedView ? (
                <div className="mb-1.5 flex items-center gap-1.5 rounded-lg border border-line bg-panel2/60 px-2 py-1.5">
                  <Archive className="h-3 w-3 text-faint" />
                  <span className="text-[11px] font-medium text-ink">Archived chats</span>
                  <span className="text-[10px] text-faint">{archivedCount}</span>
                  <span className="flex-1" />
                  <button
                    type="button"
                    onClick={() => setArchivedView(false)}
                    className="text-[10px] font-medium text-accent hover:underline"
                  >
                    Back to active
                  </button>
                </div>
              ) : null}

              {roots.length === 0 ? (
                <EmptyState
                  icon={archivedView ? <Archive className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
                  title={
                    search
                      ? 'No matching chats'
                      : archivedView
                        ? 'No archived chats'
                        : 'No chats yet'
                  }
                  description={
                    search
                      ? 'Try a different title or agent name.'
                      : archivedView
                        ? 'Older chats you archive will appear here.'
                        : 'The Orchestrator is ready. Start a conversation.'
                  }
                  action={
                    !search && !archivedView ? (
                      <Button size="sm" variant="secondary" onClick={createChat}>
                        <Plus className="h-3.5 w-3.5" /> New chat
                      </Button>
                    ) : undefined
                  }
                  className="py-6"
                />
              ) : (
                <div className="space-y-0.5">
                  {roots.map((chat) => (
                    <ChatBranch
                      key={chat.id}
                      chat={chat}
                      depth={0}
                      childrenByParent={childrenByParent}
                      agentMap={agentMap}
                      activeChatId={activeChatId}
                      expanded={expanded}
                      setExpanded={setExpanded}
                      openChat={(id) => void openChat(id)}
                      onDelete={setDeleteTarget}
                    />
                  ))}
                </div>
              )}

              {!archivedView && archivedCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setArchivedView(true)}
                  className="mt-2 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] text-muted transition-colors hover:bg-panel2 hover:text-ink"
                >
                  <Archive className="h-3.5 w-3.5" />
                  Archived chats
                  <span className="flex-1" />
                  <span className="text-[10px] text-faint">{archivedCount}</span>
                </button>
              ) : null}
              {archivedView ? (
                <button
                  type="button"
                  onClick={() => setArchivedView(false)}
                  className="mt-2 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] text-muted transition-colors hover:bg-panel2 hover:text-ink"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to active chats
                </button>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="border-t border-line px-2 py-2">
          <button
            type="button"
            onClick={() => openModal({ type: 'settings', tab: 'providers' })}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] text-muted transition-colors hover:bg-panel2 hover:text-ink"
          >
            <Settings className="h-3.5 w-3.5" />
            Settings
            <span className="flex-1" />
            <span
              className={cn('h-1.5 w-1.5 rounded-full', connected ? 'bg-success' : 'bg-danger')}
              title={connected ? 'Live updates connected' : 'Reconnecting…'}
            />
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] text-muted transition-colors hover:bg-panel2 hover:text-ink"
          >
            {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            <span className="flex-1" />
            <span className="text-[10px] text-faint">v0.1</span>
          </button>
        </div>
      </aside>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete chat?"
        message={
          deleteTarget
            ? `"${deleteTarget.title}" and any sub-agent chats will be permanently deleted, including uploaded files.`
            : ''
        }
        loading={deleting}
        onClose={() => {
          if (!deleting) setDeleteTarget(null)
        }}
        onConfirm={async () => {
          if (!deleteTarget) return
          setDeleting(true)
          await deleteChat(deleteTarget.id)
          setDeleting(false)
          setDeleteTarget(null)
        }}
      />
    </>
  )
}
