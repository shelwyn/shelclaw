import {
  Archive,
  ArrowLeft,
  Brain,
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  Folder,
  FolderKanban,
  FolderOpen,
  MessageSquare,
  Moon,
  PanelLeftClose,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Settings,
  Sun,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '../store'
import type { Agent, Chat, Project, UsageTotals } from '../types'
import { relativeTime, fmtTokens, fmtCost } from '../lib/format'
import { Avatar, Badge, Button, cn, ConfirmDialog, EmptyState, Spinner } from './ui'

function ChatRow({
  chat,
  depth,
  agent,
  active,
  unread,
  onClick,
  onDelete,
  onRename,
}: {
  chat: Chat
  depth: number
  agent?: Agent
  active: boolean
  unread: boolean
  onClick: () => void
  onDelete: () => void
  onRename: (title: string) => void
}) {
  const running = chat.status === 'running'
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(chat.title)

  useEffect(() => {
    if (!editing) setTitle(chat.title)
  }, [chat.title, editing])

  const save = () => {
    setEditing(false)
    const next = title.trim()
    if (next && next !== chat.title) onRename(next)
  }

  return (
    <div
      className={cn(
        'group flex w-full items-center gap-1 rounded-lg pr-1 transition-colors',
        active ? 'bg-accent-soft text-ink' : 'text-muted hover:bg-panel2 hover:text-ink',
      )}
      style={depth > 0 ? { paddingLeft: 4 + depth * 12 } : undefined}
    >
      {editing ? (
        <input
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === 'Enter') save()
            if (event.key === 'Escape') {
              setEditing(false)
              setTitle(chat.title)
            }
          }}
          className="my-1 h-6 min-w-0 flex-1 rounded border border-line-strong bg-panel px-1.5 text-[12px] text-ink outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={onClick}
          onDoubleClick={() => setEditing(true)}
          className="flex min-w-0 flex-1 items-center gap-2 py-[7px] pl-1.5 text-left"
          title={chat.title}
        >
          {depth > 0 ? (
            <CornerDownRight className="h-3 w-3 shrink-0 text-faint" />
          ) : running ? (
            <Spinner className="h-3.5 w-3.5 shrink-0 text-ink" />
          ) : null}
          <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{chat.title}</span>
          {unread ? (
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-ink"
              title="Unread"
              aria-label="Unread"
            />
          ) : null}
          <span className="shrink-0 text-[10px] tabular-nums text-faint">
            {running ? 'working' : relativeTime(chat.lastMessageAt)}
          </span>
        </button>
      )}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          setEditing(true)
        }}
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-faint opacity-100 transition-opacity hover:bg-panel hover:text-ink md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
        aria-label={`Rename ${chat.title}`}
        title="Rename chat"
      >
        <Pencil className="h-3 w-3" />
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          onDelete()
        }}
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-faint opacity-100 transition-opacity hover:bg-panel hover:text-danger md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
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
  unreadChatIds,
  expanded,
  setExpanded,
  openChat,
  onDelete,
  onRename,
}: {
  chat: Chat
  depth: number
  childrenByParent: Map<string, Chat[]>
  agentMap: Map<string, Agent>
  activeChatId: string
  unreadChatIds: string[]
  expanded: Record<string, boolean>
  setExpanded: Dispatch<SetStateAction<Record<string, boolean>>>
  openChat: (id: string) => void
  onDelete: (chat: Chat) => void
  onRename: (chat: Chat, title: string) => void
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
        unread={unreadChatIds.includes(chat.id)}
        onClick={() => openChat(chat.id)}
        onDelete={() => onDelete(chat)}
        onRename={(title) => onRename(chat, title)}
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
              unreadChatIds={unreadChatIds}
              expanded={expanded}
              setExpanded={setExpanded}
              openChat={openChat}
              onDelete={onDelete}
              onRename={onRename}
            />
          ))}
          {children.length > shown.length ? (
            <button
              type="button"
              onClick={() => setExpanded((current) => ({ ...current, [chat.id]: true }))}
              className="flex items-center gap-1 px-2 py-1 text-[10.5px] text-faint hover:text-ink"
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
              className="flex items-center gap-1 px-2 py-1 text-[10.5px] text-faint hover:text-ink"
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
  collapsed,
  agentCount,
  chatCount,
  onSelect,
  onToggleCollapse,
  onEdit,
  onMemory,
  onDelete,
  onTogglePin,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  memoryActive,
  unread,
}: {
  project: Project
  active: boolean
  collapsed: boolean
  agentCount: number
  chatCount: number
  onSelect: () => void
  onToggleCollapse: () => void
  onEdit: () => void
  onMemory: () => void
  onDelete: () => void
  onTogglePin: () => void
  onDragStart: (event: React.DragEvent<HTMLDivElement>) => void
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void
  onDragEnd: () => void
  memoryActive: boolean
  unread: boolean
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={cn(
        'group flex w-full cursor-grab items-center gap-0.5 rounded-lg pr-1 transition-colors active:cursor-grabbing',
        active ? 'bg-accent-soft text-ink' : 'text-muted hover:bg-panel2 hover:text-ink',
      )}
    >
      <button
        type="button"
        onClick={onToggleCollapse}
        className="inline-flex h-6 w-5 shrink-0 items-center justify-center rounded text-faint hover:text-ink"
        aria-label={collapsed ? `Expand ${project.name}` : `Collapse ${project.name}`}
        title={collapsed ? 'Expand project' : 'Collapse project'}
      >
        {active && !collapsed ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
      </button>
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-2 py-[7px] pr-1 text-left"
        title={project.workspacePath}
        aria-expanded={active && !collapsed}
      >
        <Folder className="h-3.5 w-3.5 shrink-0 text-faint" />
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{project.name}</span>
        {unread ? (
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-ink"
            title="Unread activity"
            aria-label="Unread activity"
          />
        ) : null}
        {!active && chatCount ? (
          <span className="shrink-0 text-[9.5px] tabular-nums text-faint">
            {agentCount}a · {chatCount}c
          </span>
        ) : null}
      </button>
      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          onClick={onTogglePin}
          className={cn(
            'inline-flex h-6 w-6 items-center justify-center rounded hover:bg-panel hover:text-ink',
            project.pinned ? 'text-ink' : 'text-faint opacity-100 md:opacity-0 md:group-hover:opacity-100',
          )}
          aria-label={project.pinned ? `Unpin ${project.name}` : `Pin ${project.name}`}
          title={project.pinned ? 'Unpin project' : 'Pin project'}
        >
          {project.pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
        </button>
        {active ? (
          <>
            <button
              type="button"
              onClick={onMemory}
              className={cn(
                'inline-flex h-6 w-6 items-center justify-center rounded hover:bg-panel hover:text-ink',
                memoryActive ? 'text-ink' : 'text-faint',
              )}
              aria-label="Memory links"
              title="Memory links"
            >
              <Brain className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex h-6 w-6 items-center justify-center rounded text-faint hover:bg-panel hover:text-ink"
              aria-label="Project settings"
              title="Project settings"
            >
              <Pencil className="h-3 w-3" />
            </button>
          </>
        ) : null}
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex h-6 w-6 items-center justify-center rounded text-faint opacity-100 transition-opacity hover:bg-panel hover:text-danger md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
          aria-label={`Delete ${project.name}`}
          title="Delete project"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}

function AgentRow({
  agent,
  busyTitle,
  activeChatId,
  unread,
  usage,
  onOpen,
  onEdit,
}: {
  agent: Agent
  busyTitle?: string
  activeChatId: string
  unread: boolean
  usage?: UsageTotals
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
              <Spinner className="h-2 w-2 text-ink" />
            </span>
          ) : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[12.5px] font-medium text-ink">{agent.name}</span>
            {unread ? (
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-ink"
                title="Finished — open to view"
                aria-label="Unread"
              />
            ) : null}
            {agent.canSpawn ? <Badge tone="accent">delegates</Badge> : null}
          </span>
          <span
            className={cn(
              'mt-0.5 block truncate text-[10.5px]',
              busy ? 'text-ink' : 'text-faint',
            )}
          >
            {busy
              ? `working on ${busyTitle}`
              : [
                  agent.model || 'harness default',
                  usage ? `${fmtTokens(usage.total)} tok` : '',
                  usage?.cost ? fmtCost(usage.cost) : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
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
    unreadChatIds,
    search,
    archivedView,
    sidebarOpen,
    sidebarCollapsed,
    theme,
    connected,
    setActiveProject,
    setSearch,
    setArchivedView,
    setSidebarOpen,
    toggleSidebarCollapsed,
    openChat,
    openAgentChat,
    newChat,
    openMemory,
    openModal,
    toggleTheme,
    deleteChat,
    renameChat,
    deleteProject,
    reorderProjects,
    toggleProjectPin,
    clearUnreadForAgent,
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
      unreadChatIds: state.unreadChatIds,
      search: state.search,
      archivedView: state.archivedView,
      sidebarOpen: state.sidebarOpen,
      sidebarCollapsed: state.sidebarCollapsed,
      theme: state.theme,
      connected: state.connected,
      setActiveProject: state.setActiveProject,
      setSearch: state.setSearch,
      setArchivedView: state.setArchivedView,
      setSidebarOpen: state.setSidebarOpen,
      toggleSidebarCollapsed: state.toggleSidebarCollapsed,
      openChat: state.openChat,
      openAgentChat: state.openAgentChat,
      newChat: state.newChat,
      openMemory: state.openMemory,
      openModal: state.openModal,
      toggleTheme: state.toggleTheme,
      deleteChat: state.deleteChat,
      renameChat: state.renameChat,
      deleteProject: state.deleteProject,
      reorderProjects: state.reorderProjects,
      toggleProjectPin: state.toggleProjectPin,
      clearUnreadForAgent: state.clearUnreadForAgent,
    })),
  )

  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [deleteTarget, setDeleteTarget] = useState<Chat | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [projectDeleteTarget, setProjectDeleteTarget] = useState<Project | null>(null)
  const [deletingProject, setDeletingProject] = useState(false)
  const [collapsedProjectId, setCollapsedProjectId] = useState('')
  const [draggingProjectId, setDraggingProjectId] = useState('')
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
  const unreadSet = useMemo(() => new Set(unreadChatIds), [unreadChatIds])
  const agentUnread = (agentId: string) =>
    chats.some((chat) => chat.agentId === agentId && unreadSet.has(chat.id))
  const agentUsage = (agentId: string): UsageTotals | undefined =>
    chats.find(
      (chat) =>
        chat.projectId === activeProjectId &&
        chat.agentId === agentId &&
        (chat.kind === 'direct' || chat.kind === 'root'),
    )?.usage
  const projectUnread = (projectId: string) =>
    chats.some((chat) => chat.projectId === projectId && unreadSet.has(chat.id))

  const openAgent = (agentId: string) => {
    clearUnreadForAgent(agentId)
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

  useEffect(() => {
    setCollapsedProjectId('')
  }, [activeProjectId])

  const toggleProjectCollapse = (projectId: string) => {
    if (projectId !== activeProjectId) {
      setActiveProject(projectId)
      setCollapsedProjectId('')
      return
    }
    setCollapsedProjectId((current) => (current === projectId ? '' : projectId))
  }

  const moveProject = (targetId: string) => {
    if (!draggingProjectId || draggingProjectId === targetId) return
    const ids = projects.map((project) => project.id)
    const from = ids.indexOf(draggingProjectId)
    const to = ids.indexOf(targetId)
    if (from < 0 || to < 0) return
    ids.splice(to, 0, ...ids.splice(from, 1))
    void reorderProjects(ids)
  }

  if (sidebarCollapsed && !sidebarOpen) return null

  const renderActiveProject = () => (
    <div className="mb-1 ml-[15px] border-l border-line/70 pb-1 pl-1.5">
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
                    <Spinner className="h-2 w-2 text-ink" />
                  </span>
                ) : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[12px] font-semibold text-ink">
                    {orchestrator.name}
                  </span>
                  {agentUnread(orchestrator.id) ? (
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-ink"
                      title="Finished — open to view"
                      aria-label="Unread"
                    />
                  ) : null}
                  <Badge tone="accent">plans</Badge>
                </span>
                <span className="block truncate text-[9.5px] text-faint">
                  {busyFor(orchestrator.id)
                    ? `working on ${busyFor(orchestrator.id)}`
                    : agentUsage(orchestrator.id)
                      ? `${fmtTokens(agentUsage(orchestrator.id)!.total)} tok · ${fmtCost(
                          agentUsage(orchestrator.id)!.cost,
                        )}`
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
          title="New agent"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {userAgents.length === 0 ? (
        <div className="mx-1 rounded-lg border border-dashed border-line px-2 py-3 text-center">
          <p className="text-[10.5px] leading-relaxed text-faint">
            No agents yet. The Orchestrator can research and plan; add agents to delegate execution.
          </p>
          <button
            type="button"
            onClick={createAgent}
            className="mt-1 text-[10.5px] font-medium text-ink hover:underline"
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
              unread={agentUnread(agent.id)}
              usage={agentUsage(agent.id)}
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
          title="New chat"
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
            className="text-[10px] font-medium text-ink hover:underline"
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
              unreadChatIds={unreadChatIds}
              expanded={expanded}
              setExpanded={setExpanded}
              openChat={(id) => void openChat(id)}
              onDelete={setDeleteTarget}
              onRename={(chat, title) => void renameChat(chat.id, title)}
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
    </div>
  )

  const renderProjectRow = (project: Project) => (
    <div key={project.id}>
      <ProjectRow
        project={project}
        active={project.id === activeProjectId}
        collapsed={collapsedProjectId === project.id}
        agentCount={
          agents.filter((agent) => agent.projectId === project.id && !agent.isOrchestrator).length
        }
        chatCount={
          chats.filter(
            (chat) => chat.projectId === project.id && !chat.parentChatId && !chat.archivedAt,
          ).length
        }
        onSelect={() => {
          setActiveProject(project.id)
          if (collapsedProjectId === project.id) setCollapsedProjectId('')
        }}
        onToggleCollapse={() => toggleProjectCollapse(project.id)}
        onEdit={() => openModal({ type: 'project', id: project.id })}
        onMemory={() => void openMemory(project.id)}
        onDelete={() => setProjectDeleteTarget(project)}
        onTogglePin={() => void toggleProjectPin(project.id)}
        onDragStart={(event) => {
          setDraggingProjectId(project.id)
          event.dataTransfer.effectAllowed = 'move'
          event.dataTransfer.setData('text/plain', project.id)
        }}
        onDragOver={(event) => {
          event.preventDefault()
          event.dataTransfer.dropEffect = 'move'
        }}
        onDrop={(event) => {
          event.preventDefault()
          moveProject(project.id)
          setDraggingProjectId('')
        }}
        onDragEnd={() => setDraggingProjectId('')}
        memoryActive={project.id === activeProjectId && memoryActive}
        unread={projectUnread(project.id)}
      />
      {project.id === activeProjectId && collapsedProjectId !== project.id
        ? renderActiveProject()
        : null}
    </div>
  )

  const pinnedProjects = projects.filter((project) => project.pinned)
  const unpinnedProjects = projects.filter((project) => !project.pinned)

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
        <div className="flex items-center gap-2 px-3 pb-2 pt-3.5">
          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-[-0.02em] text-ink">
            {settings.workspaceName || 'Shelclaw'}
          </span>
          <button
            type="button"
            onClick={toggleSidebarCollapsed}
            className="hidden h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-panel2 hover:text-ink md:inline-flex"
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-panel2 hover:text-ink md:hidden"
            aria-label="Close sidebar"
            title="Close sidebar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-3 pb-2">
          <Button variant="secondary" size="md" className="w-full justify-start" onClick={createChat}>
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
                title="Clear search"
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
              title="New project"
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
            <div className="space-y-1">
              {pinnedProjects.length ? (
                <div>
                  <div className="px-2 pb-0.5 pt-1 text-[9.5px] font-medium uppercase tracking-[0.08em] text-faint">
                    Pinned
                  </div>
                  <div className="space-y-0.5">{pinnedProjects.map(renderProjectRow)}</div>
                </div>
              ) : null}
              {unpinnedProjects.length ? (
                <div>
                  {pinnedProjects.length ? (
                    <div className="px-2 pb-0.5 pt-2 text-[9.5px] font-medium uppercase tracking-[0.08em] text-faint">
                      Projects
                    </div>
                  ) : null}
                  <div className="space-y-0.5">{unpinnedProjects.map(renderProjectRow)}</div>
                </div>
              ) : null}
            </div>
          )}
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
              className={cn('h-1.5 w-1.5 rounded-full', connected ? 'bg-ink' : 'bg-danger')}
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

      <ConfirmDialog
        open={Boolean(projectDeleteTarget)}
        title="Delete project?"
        message={
          projectDeleteTarget
            ? `"${projectDeleteTarget.name}" and all of its agents and chats will be permanently deleted. Uploaded files for its chats are removed. The workspace folder itself is kept.`
            : ''
        }
        loading={deletingProject}
        onClose={() => {
          if (!deletingProject) setProjectDeleteTarget(null)
        }}
        onConfirm={async () => {
          if (!projectDeleteTarget) return
          setDeletingProject(true)
          await deleteProject(projectDeleteTarget.id)
          setDeletingProject(false)
          setProjectDeleteTarget(null)
        }}
      />
    </>
  )
}
