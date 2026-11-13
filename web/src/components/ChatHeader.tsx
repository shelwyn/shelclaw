import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronsUpDown,
  Cpu,
  FolderKanban,
  Menu,
  MoreHorizontal,
  Moon,
  PanelRight,
  Pencil,
  Plus,
  Search,
  Settings2,
  Square,
  Sun,
  Trash2,
  Wand2,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '../store'
import type { Agent, Chat, Provider } from '../types'
import { modelShort, isHarnessKind } from '../lib/format'
import { Avatar, Badge, Button, cn, ConfirmDialog, MenuItem, Popover, Spinner } from './ui'

function AgentPicker({ chat, agent }: { chat: Chat; agent?: Agent }) {
  const agents = useAppStore((state) => state.agents).filter(
    (entry) => entry.projectId === chat.projectId,
  )
  const selectAgent = useAppStore((state) => state.selectAgent)

  return (
    <Popover
      width="w-72"
      trigger={() => (
        <button
          type="button"
          className="inline-flex h-8 max-w-[190px] items-center gap-1.5 rounded-lg border border-line bg-panel px-1.5 text-[12px] text-muted transition-colors hover:border-line-strong hover:text-ink sm:px-2"
          title="Change orchestrating agent"
        >
          {agent ? <Avatar name={agent.name} color={agent.color} size="xs" /> : <Wand2 className="h-3.5 w-3.5" />}
          <span className="hidden truncate font-medium text-ink sm:inline">{agent?.name || 'Select agent'}</span>
          <ChevronDown className="hidden h-3 w-3 shrink-0 text-faint sm:block" />
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="px-2 pb-1 pt-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-faint">
            Orchestrating agent
          </div>
          {agents.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                void selectAgent(item.id)
                close()
              }}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors',
                item.id === chat.agentId ? 'bg-accent-soft' : 'hover:bg-panel2',
              )}
            >
              <Avatar name={item.name} color={item.color} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[12.5px] font-medium text-ink">{item.name}</span>
                  {item.canSpawn ? <Badge tone="accent">delegates</Badge> : null}
                </span>
                <span className="mt-0.5 line-clamp-1 block text-[10.5px] text-faint">
                  {item.isOrchestrator ? 'researches, plans, coordinates' : item.description || 'No description'}
                </span>
              </span>
              {item.id === chat.agentId ? <Check className="h-3.5 w-3.5 shrink-0 text-accent" /> : null}
            </button>
          ))}
        </div>
      )}
    </Popover>
  )
}

function isHarnessProvider(provider?: Provider): boolean {
  return Boolean(provider && isHarnessKind(provider.kind))
}

function ModelPicker({ chat }: { chat: Chat }) {
  const allProviders = useAppStore((state) => state.providers)
  const providers = useMemo(
    () => allProviders.filter((provider) => isHarnessKind(provider.kind)),
    [allProviders],
  )
  const agents = useAppStore((state) => state.agents)
  const settings = useAppStore((state) => state.settings)
  const selectModel = useAppStore((state) => state.selectModel)
  const openModal = useAppStore((state) => state.openModal)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const agent = agents.find((entry) => entry.id === chat.agentId)
  const providerSelection =
    providers.find((provider) => provider.id === chat.providerId) ||
    providers.find((provider) => provider.id === agent?.providerId) ||
    providers.find((provider) => provider.id === settings.defaultProviderId) ||
    providers[0]
  const isHarness = isHarnessProvider(providerSelection)
  const label =
    chat.model ||
    (isHarness
      ? 'Harness default'
      : providerSelection?.defaultModel || providerSelection?.models[0] || 'Select model')

  const groups = useMemo(() => {
    const search = query.trim().toLowerCase()
    return providers
      .map((provider) => {
        const models = [...new Set([provider.defaultModel, ...provider.models].filter(Boolean))]
        const filtered = search
          ? models.filter(
              (model) =>
                model.toLowerCase().includes(search) || provider.name.toLowerCase().includes(search),
            )
          : models
        return { provider, models: filtered }
      })
      .filter((group) => !search || group.models.length > 0 || group.provider.name.toLowerCase().includes(search))
  }, [providers, query])

  return (
    <Popover
      width="w-[320px]"
      align="end"
      trigger={() => (
        <button
          type="button"
          className="inline-flex h-8 max-w-[220px] items-center gap-1.5 rounded-lg border border-line bg-panel px-1.5 text-[12px] text-muted transition-colors hover:border-line-strong hover:text-ink sm:px-2"
          title="Model used by the orchestrating agent"
        >
          <Cpu className="h-3.5 w-3.5 shrink-0 text-faint" />
          <span className="hidden truncate font-medium text-ink sm:inline">{modelShort(label)}</span>
          <ChevronsUpDown className="hidden h-3 w-3 shrink-0 text-faint sm:block" />
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="p-1.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-faint" />
              <input
                ref={inputRef}
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search models"
                className="h-7.5 w-full rounded-md border border-line bg-panel2 pl-7 pr-2 text-[11.5px] text-ink placeholder:text-faint focus:border-accent/50 focus:outline-none"
              />
            </div>
          </div>
          <div className="scroll-thin max-h-[300px] overflow-y-auto px-1 pb-1">
            {isHarness && providerSelection ? (
              <button
                type="button"
                onClick={() => {
                  void selectModel(providerSelection.id, '')
                  close()
                }}
                className={cn(
                  'mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11.5px] transition-colors',
                  !chat.model ? 'bg-accent-soft text-ink' : 'text-muted hover:bg-panel2 hover:text-ink',
                )}
              >
                <Wand2 className="h-3 w-3 shrink-0 text-accent" />
                <span className="flex-1">Use harness default</span>
                {!chat.model ? <Check className="h-3 w-3 text-accent" /> : null}
              </button>
            ) : null}
            {groups.length === 0 ? (
              <div className="px-2 py-4 text-center text-[11.5px] text-faint">No harnesses connected.</div>
            ) : (
              groups.map(({ provider, models }) => (
                <div key={provider.id} className="mb-1">
                  <div className="flex items-center gap-1.5 px-2 py-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent/70" />
                    <span className="truncate text-[10px] font-semibold uppercase tracking-[0.06em] text-faint">
                      {provider.name}
                    </span>
                  </div>
                  {models.length === 0 ? (
                    <div className="px-2 pb-1.5 text-[10.5px] text-faint">
                      No models listed. Add one in provider settings.
                    </div>
                  ) : (
                    models.map((model) => {
                      const active = chat.providerId === provider.id && chat.model === model
                      return (
                        <button
                          key={`${provider.id}-${model}`}
                          type="button"
                          onClick={() => {
                            void selectModel(provider.id, model)
                            close()
                          }}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors',
                            active ? 'bg-accent-soft text-ink' : 'text-muted hover:bg-panel2 hover:text-ink',
                          )}
                        >
                          <span className="min-w-0 flex-1 truncate">{model}</span>
                          {active ? <Check className="h-3 w-3 shrink-0 text-accent" /> : null}
                        </button>
                      )
                    })
                  )}
                </div>
              ))
            )}
          </div>
          <div className="mt-0.5 border-t border-line pt-1">
            <MenuItem
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => {
                close()
                openModal({ type: 'settings', tab: 'providers' })
              }}
            >
              Connect or manage harnesses
            </MenuItem>
          </div>
        </div>
      )}
    </Popover>
  )
}

export function ChatHeader() {
  const agents = useAppStore((state) => state.agents)
  const chats = useAppStore((state) => state.chats)
  const projects = useAppStore((state) => state.projects)
  const activeRuns = useAppStore((state) => state.activeRuns)
  const setSidebarOpen = useAppStore((state) => state.setSidebarOpen)
  const toggleInspector = useAppStore((state) => state.toggleInspector)
  const inspectorOpen = useAppStore((state) => state.inspectorOpen)
  const openChat = useAppStore((state) => state.openChat)
  const updateChat = useAppStore((state) => state.updateChat)
  const deleteChat = useAppStore((state) => state.deleteChat)
  const stop = useAppStore((state) => state.stop)
  const archiveChat = useAppStore((state) => state.archiveChat)
  const openModal = useAppStore((state) => state.openModal)
  const toggleTheme = useAppStore((state) => state.toggleTheme)
  const theme = useAppStore((state) => state.theme)
  const chat = useAppStore((state) => state.detail?.chat || null)
  const activeTasks = useAppStore((state) =>
    state.detail
      ? state.detail.tasks.filter((task) => task.status === 'running' || task.status === 'queued').length
      : 0,
  )

  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const agent = agents.find((entry) => entry.id === chat?.agentId)
  const project = projects.find((entry) => entry.id === chat?.projectId)
  const parent = chats.find((entry) => entry.id === chat?.parentChatId)
  const running = Boolean(chat && activeRuns.some((run) => run.chatId === chat.id && run.status === 'running'))

  useEffect(() => {
    setEditing(false)
    setTitle(chat?.title || '')
  }, [chat?.id])

  if (!chat) return null

  const commitTitle = () => {
    setEditing(false)
    const next = title.trim()
    if (next && next !== chat.title) void updateChat({ title: next })
  }

  const childrenCount = chats.filter((entry) => entry.parentChatId === chat.id).length

  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-panel/80 px-3 backdrop-blur-sm sm:px-4">
      <button
        type="button"
        onClick={() => setSidebarOpen(true)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-panel2 hover:text-ink md:hidden"
        aria-label="Open sidebar"
      >
        <Menu className="h-4 w-4" />
      </button>

      {chat.parentChatId ? (
        <button
          type="button"
          onClick={() => void openChat(chat.parentChatId)}
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-1.5 text-[11.5px] text-muted hover:bg-panel2 hover:text-ink"
          title="Back to parent chat"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span className="hidden max-w-[110px] truncate sm:inline">{parent?.title || 'Parent'}</span>
        </button>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col justify-center">
        {editing ? (
          <input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={commitTitle}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitTitle()
              if (event.key === 'Escape') {
                setEditing(false)
                setTitle(chat.title)
              }
            }}
            className="h-6 w-full max-w-sm rounded border border-accent/40 bg-panel px-1.5 text-[13px] font-semibold text-ink outline-none ring-2 ring-accent/15"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setTitle(chat.title)
              setEditing(true)
            }}
            className="group flex min-w-0 items-center gap-1.5 self-start rounded px-0.5 text-left"
          >
            <span className="truncate text-[13px] font-semibold tracking-[-0.01em] text-ink">
              {chat.title}
            </span>
            <Pencil className="h-3 w-3 shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        )}
        <div className="flex items-center gap-1.5 text-[10px] text-faint">
          {chat.kind === 'agent' ? <Badge tone="accent">sub-agent</Badge> : null}
          {project ? (
            <span className="inline-flex items-center gap-1">
              <FolderKanban className="h-2.5 w-2.5" />
              {project.name}
            </span>
          ) : null}
          {agent ? (
            <span className="inline-flex items-center gap-1">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: agent.color }}
              />
              {agent.name}
            </span>
          ) : null}
          {running ? (
            <span className="inline-flex items-center gap-1 text-accent">
              <Spinner className="h-2.5 w-2.5" />
              working
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <div className="flex items-center gap-1.5">
          <AgentPicker chat={chat} agent={agent} />
          <ModelPicker chat={chat} />
        </div>

        {running ? (
          <Button variant="outline" size="sm" onClick={() => void stop()} title="Stop this run">
            <Square className="h-3 w-3 fill-current" />
            Stop
          </Button>
        ) : null}

        <button
          type="button"
          onClick={toggleInspector}
          className={cn(
            'relative inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
            inspectorOpen
              ? 'bg-panel2 text-ink'
              : 'text-muted hover:bg-panel2 hover:text-ink',
          )}
          title="Toggle orchestration panel"
          aria-label="Toggle orchestration panel"
        >
          <PanelRight className="h-4 w-4" />
          {activeTasks > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-accent text-[8px] font-bold text-accent-ink">
              {activeTasks}
            </span>
          ) : null}
        </button>

        <Popover
          align="end"
          width="w-52"
          trigger={() => (
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-panel2 hover:text-ink"
              aria-label="Chat actions"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          )}
        >
          {(close) => (
            <div>
              <MenuItem
                icon={<Pencil className="h-3.5 w-3.5" />}
                onClick={() => {
                  close()
                  setTitle(chat.title)
                  setEditing(true)
                }}
              >
                Rename chat
              </MenuItem>
              <MenuItem
                icon={<Settings2 className="h-3.5 w-3.5" />}
                onClick={() => {
                  close()
                  openModal({ type: 'settings', tab: 'workspace' })
                }}
              >
                Workspace settings
              </MenuItem>
              <MenuItem
                icon={
                  chat.archivedAt ? (
                    <ArchiveRestore className="h-3.5 w-3.5" />
                  ) : (
                    <Archive className="h-3.5 w-3.5" />
                  )
                }
                disabled={running}
                hint={running ? 'stop run first' : undefined}
                onClick={() => {
                  close()
                  void archiveChat(chat.id, !chat.archivedAt)
                }}
              >
                {chat.archivedAt ? 'Restore chat' : 'Archive chat'}
              </MenuItem>
              <MenuItem
                icon={theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                onClick={() => {
                  close()
                  toggleTheme()
                }}
              >
                Switch to {theme === 'dark' ? 'light' : 'dark'} mode
              </MenuItem>
              <div className="my-1 h-px bg-line" />
              <MenuItem
                icon={<Trash2 className="h-3.5 w-3.5" />}
                danger
                disabled={running}
                hint={running ? 'stop run first' : undefined}
                onClick={() => {
                  close()
                  setConfirmDelete(true)
                }}
              >
                Delete chat
              </MenuItem>
            </div>
          )}
        </Popover>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this chat?"
        message={
          childrenCount
            ? `This will permanently delete this chat and its ${childrenCount} sub-agent chat${childrenCount === 1 ? '' : 's'}, including all messages and run history.`
            : 'This will permanently delete the chat and its messages. This cannot be undone.'
        }
        loading={deleting}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setDeleting(true)
          await deleteChat(chat.id)
          setDeleting(false)
          setConfirmDelete(false)
        }}
      />
    </header>
  )
}
