import { FolderKanban, FolderOpen, Package, Plus, Settings2 } from 'lucide-react'
import { useAppStore } from '../store'
import { fmtTokens } from '../lib/format'
import { ChatHeader } from './ChatHeader'
import { Composer } from './Composer'
import { MessageList } from './MessageList'
import { Button, cn, Spinner } from './ui'

function OrchestrationBar() {
  const detailId = useAppStore((state) => state.detail?.chat.id || '')
  const orchestrationRunId = useAppStore((state) => state.detail?.orchestrationRunId || '')
  const tasks = useAppStore((state) => state.detail?.tasks) || []
  const agents = useAppStore((state) => state.agents)
  const activeRuns = useAppStore((state) => state.activeRuns)
  const toggleInspector = useAppStore((state) => state.toggleInspector)
  const inspectorOpen = useAppStore((state) => state.inspectorOpen)

  if (!detailId || !orchestrationRunId) return null
  const runTasks = tasks.filter((task) => task.rootRunId === orchestrationRunId)
  if (!runTasks.length) return null
  const running = runTasks.filter((task) => task.status === 'running' || task.status === 'queued')
  const done = runTasks.filter((task) => task.status === 'done')
  const failed = runTasks.filter((task) => task.status === 'error')
  const tokens = runTasks.reduce(
    (sum, task) => sum + (task.usage.total ?? (task.usage.input || 0) + (task.usage.output || 0)),
    0,
  )
  const activeRun = activeRuns.some((run) => run.chatId === detailId && run.status === 'running')
  const current = running[0]
  const currentAgent = current ? agents.find((agent) => agent.id === current.agentId) : undefined

  return (
    <div className="flex h-8 shrink-0 items-center gap-2 border-b border-line bg-panel/60 px-3 text-[10.5px] text-muted sm:px-4">
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          running.length ? 'bg-accent pulse-soft' : failed.length ? 'bg-danger' : 'bg-success',
        )}
      />
      <span className="font-medium text-ink">Orchestration</span>
      <span className="hidden text-faint sm:inline">·</span>
      <span className="hidden sm:inline">
        {running.length
          ? `${running.length} agent${running.length === 1 ? '' : 's'} working`
          : failed.length
            ? `${failed.length} failed`
            : 'all agents complete'}
      </span>
      {currentAgent ? (
        <span className="hidden items-center gap-1 truncate md:inline-flex">
          <span className="text-faint">·</span>
          <span
            className="h-1 w-1 rounded-full"
            style={{ backgroundColor: currentAgent.color }}
          />
          {currentAgent.name}: {current.title}
        </span>
      ) : null}
      <span className="flex-1" />
      <span className="hidden text-faint sm:inline">
        {done.length}/{tasks.length} done
      </span>
      {tokens ? <span className="hidden text-faint md:inline">· {fmtTokens(tokens)} tokens</span> : null}
      {activeRun ? <Spinner className="h-3 w-3 text-accent" /> : null}
      <button
        type="button"
        onClick={toggleInspector}
        className="ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5 font-medium text-accent hover:bg-accent-soft"
      >
        {inspectorOpen ? 'Hide panel' : 'View panel'}
      </button>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-14 items-center gap-3 border-b border-line px-4">
        <div className="h-7 w-40 rounded-md bg-panel2" />
        <div className="flex-1" />
        <div className="h-7 w-24 rounded-md bg-panel2" />
        <div className="h-7 w-32 rounded-md bg-panel2" />
      </div>
      <div className="mx-auto w-full max-w-3xl flex-1 space-y-8 px-6 py-8">
        <div className="ml-auto h-16 w-2/3 rounded-2xl bg-panel2/80" />
        <div className="space-y-2.5">
          <div className="h-3 w-32 rounded bg-panel2/80" />
          <div className="h-3 w-full rounded bg-panel2/60" />
          <div className="h-3 w-11/12 rounded bg-panel2/60" />
          <div className="h-3 w-4/5 rounded bg-panel2/60" />
        </div>
        <div className="ml-auto h-12 w-1/2 rounded-2xl bg-panel2/80" />
      </div>
    </div>
  )
}

function Hero() {
  const projects = useAppStore((state) => state.projects)
  const activeProjectId = useAppStore((state) => state.activeProjectId)
  const providers = useAppStore((state) => state.providers)
  const newChat = useAppStore((state) => state.newChat)
  const openModal = useAppStore((state) => state.openModal)
  const openFilesPanel = useAppStore((state) => state.openFilesPanel)
  const openArtifactsPanel = useAppStore((state) => state.openArtifactsPanel)

  const project = projects.find((entry) => entry.id === activeProjectId)

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm text-center">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-panel text-muted">
          <FolderKanban className="h-5 w-5" />
        </span>
        <h1 className="mt-4 truncate text-[18px] font-semibold tracking-[-0.01em] text-ink">
          {project?.name || 'No project selected'}
        </h1>
        <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
          {project
            ? 'Start a chat with the Orchestrator, or pick an agent from the sidebar.'
            : 'Create a project to get started.'}
        </p>
        {project?.workspacePath ? (
          <p
            className="mt-2 truncate font-mono text-[10px] text-faint"
            title={project.workspacePath}
          >
            {project.workspacePath}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {project ? (
            <Button variant="primary" size="md" onClick={() => void newChat()}>
              <Plus className="h-4 w-4" />
              New chat
            </Button>
          ) : (
            <Button
              variant="primary"
              size="md"
              onClick={() => openModal({ type: 'project' })}
            >
              <Plus className="h-4 w-4" />
              Create project
            </Button>
          )}
          {providers.length === 0 ? (
            <Button
              variant="outline"
              size="md"
              onClick={() => openModal({ type: 'settings', tab: 'providers' })}
            >
              <Settings2 className="h-4 w-4" />
              Connect harness
            </Button>
          ) : null}
          {project ? (
            <Button variant="outline" size="md" onClick={openFilesPanel}>
              <FolderOpen className="h-4 w-4" />
              Files
            </Button>
          ) : null}
          {project ? (
            <Button variant="outline" size="md" onClick={() => openArtifactsPanel()}>
              <Package className="h-4 w-4" />
              Artifacts
            </Button>
          ) : null}
        </div>

        {providers.length === 0 ? (
          <p className="mt-4 text-[10.5px] text-warn">
            No harness connected yet. Add a local harness in Settings.
          </p>
        ) : null}
      </div>
    </div>
  )
}

export function ChatView() {
  const detailId = useAppStore((state) => state.detail?.chat.id || '')
  const activeChatId = useAppStore((state) => state.activeChatId)
  const loadingChat = useAppStore((state) => state.loadingChat)

  const matches = Boolean(detailId && detailId === activeChatId)

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-bg">
      {!activeChatId ? (
        <Hero />
      ) : matches ? (
        <>
          <ChatHeader />
          <OrchestrationBar />
          <MessageList />
          <Composer />
        </>
      ) : (
        <Skeleton />
      )}
      {activeChatId && loadingChat && matches ? (
        <div className="pointer-events-none fixed left-1/2 top-2 z-50 -translate-x-1/2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-2.5 py-1 text-[10px] text-muted shadow">
            <Spinner className="h-3 w-3" /> syncing
          </span>
        </div>
      ) : null}
    </main>
  )
}
