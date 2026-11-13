import {
  ArrowRight,
  Bot,
  BrainCircuit,
  Check,
  Cpu,
  GitBranch,
  Layers,
  Network,
  Plus,
  Settings2,
  Sparkles,
  Square,
  Zap,
} from 'lucide-react'
import { useAppStore } from '../store'
import { fmtTokens } from '../lib/format'
import { ChatHeader } from './ChatHeader'
import { Composer } from './Composer'
import { MessageList } from './MessageList'
import { Avatar, Badge, Button, cn, Spinner } from './ui'

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
  const agents = useAppStore((state) => state.agents)
  const projects = useAppStore((state) => state.projects)
  const activeProjectId = useAppStore((state) => state.activeProjectId)
  const providers = useAppStore((state) => state.providers)
  const settings = useAppStore((state) => state.settings)
  const newChat = useAppStore((state) => state.newChat)
  const openAgentChat = useAppStore((state) => state.openAgentChat)
  const openModal = useAppStore((state) => state.openModal)

  const project = projects.find((entry) => entry.id === activeProjectId)
  const projectAgents = agents.filter((agent) => agent.projectId === activeProjectId)
  const orchestrator = projectAgents.find((agent) => agent.isOrchestrator)
  const team = [orchestrator, ...projectAgents.filter((agent) => !agent.isOrchestrator)].filter(
    Boolean,
  ) as typeof agents

  return (
    <div className="scroll-thin relative min-h-0 flex-1 overflow-y-auto">
      <div className="bg-grid pointer-events-none absolute inset-x-0 top-0 h-[420px]" />
      <div className="relative mx-auto w-full max-w-3xl px-6 pb-16 pt-12 sm:pt-16">
        <div className="flex flex-col items-center text-center">
          <Badge tone="accent" className="mb-4 gap-1.5 px-2.5 py-1 text-[10px]">
            <Sparkles className="h-3 w-3" />
            Local-first multi-agent orchestration
          </Badge>
          <h1 className="max-w-2xl text-[34px] font-semibold leading-[1.08] tracking-[-0.035em] text-ink sm:text-[42px]">
            One conversation.
            <br />
            <span className="bg-gradient-to-r from-accent via-[#9d8cff] to-[#c084fc] bg-clip-text text-transparent">
              A team of agents.
            </span>
          </h1>
          <p className="mt-4 max-w-xl text-[13.5px] leading-relaxed text-muted">
            {settings.workspaceName} orchestrates local agent harnesses — OpenCode, Claude Code,
            Pi, or any CLI agent — with their own models and prompts. Delegate deep work, watch
            every step live, and keep everything on your machine.
          </p>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
            {project ? (
              <Button variant="primary" size="lg" onClick={() => void newChat()}>
                <Plus className="h-4 w-4" />
                Start orchestrating
              </Button>
            ) : (
              <Button
                variant="primary"
                size="lg"
                onClick={() => openModal({ type: 'project' })}
              >
                <Plus className="h-4 w-4" />
                Create your first project
              </Button>
            )}
            <Button
              variant="outline"
              size="lg"
              onClick={() => openModal({ type: 'settings', tab: 'providers' })}
            >
              <Settings2 className="h-4 w-4" />
              Connect a harness
            </Button>
          </div>

          {project ? (
            <div className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-2.5 py-1 text-[10px] text-muted">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: project.color }}
              />
              Project · {project.name}
            </div>
          ) : null}

          {providers.length === 0 ? (
            <div className="mt-5 flex items-center gap-2 rounded-full border border-warn/30 bg-warn/10 px-3 py-1.5 text-[11px] text-warn">
              <Zap className="h-3 w-3" />
              No harnesses connected yet. Connect OpenCode, Claude Code, Pi, or a custom local command.
            </div>
          ) : (
            <div className="mt-5 flex flex-wrap items-center justify-center gap-1.5">
              {providers.slice(0, 5).map((provider) => (
                <span
                  key={provider.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-2.5 py-1 text-[10px] text-muted"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-success" />
                  {provider.name}
                </span>
              ))}
              {providers.length > 5 ? (
                <span className="text-[10px] text-faint">+{providers.length - 5} more</span>
              ) : null}
            </div>
          )}
        </div>

        <div className="mt-12 grid gap-2.5 sm:grid-cols-3">
          {[
            {
              icon: GitBranch,
              title: 'Parallel by default',
              body: 'The orchestrator fans work out to several sub-agents at once, then synthesizes the result.',
            },
            {
              icon: Cpu,
              title: 'A model per agent',
              body: 'Pin a model to each specialist, or override the model for a single delegated task.',
            },
            {
              icon: Network,
              title: 'Recursive delegation',
              body: 'Sub-agents can spawn their own sub-agents, down to a depth you control.',
            },
          ].map((feature) => (
            <div
              key={feature.title}
              className="rounded-xl border border-line bg-panel/80 p-4 backdrop-blur-sm"
            >
              <feature.icon className="h-4 w-4 text-accent" />
              <div className="mt-2.5 text-[12px] font-semibold text-ink">{feature.title}</div>
              <p className="mt-1 text-[11px] leading-relaxed text-muted">{feature.body}</p>
            </div>
          ))}
        </div>

        {team.length && project ? (
          <div className="mt-10">
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-faint">
                {project.name} team
              </span>
              <button
                type="button"
                onClick={() => openModal({ type: 'agent' })}
                className="text-[10.5px] font-medium text-accent hover:underline"
              >
                New agent
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {team.slice(0, 6).map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => void openAgentChat(agent.id)}
                  className="group flex items-start gap-2.5 rounded-xl border border-line bg-panel p-3 text-left transition-colors hover:border-accent/30"
                >
                  <Avatar name={agent.name} color={agent.color} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="text-[12px] font-semibold text-ink">{agent.name}</span>
                      {agent.isOrchestrator ? (
                        <Badge tone="accent">orchestrator</Badge>
                      ) : agent.canSpawn ? (
                        <Badge tone="accent">delegates</Badge>
                      ) : null}
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-[10.5px] leading-relaxed text-muted">
                      {agent.description}
                    </span>
                    <span className="mt-1 block truncate text-[9.5px] text-faint">
                      {agent.model || 'harness default'}
                    </span>
                  </span>
                  <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-10 rounded-xl border border-line bg-panel/70 p-4">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-ink">
            <BrainCircuit className="h-3.5 w-3.5 text-accent" />
            How a run works
          </div>
          <div className="mt-3 grid gap-3 text-[10.5px] leading-relaxed text-muted sm:grid-cols-3">
            {[
              ['01', 'Brief the orchestrator', 'Describe the outcome. It decides what to answer directly and what to delegate.'],
              ['02', 'Agents fan out', 'Independent tasks run in parallel, each with its own agent prompt and model.'],
              ['03', 'Synthesis lands', 'The orchestrator merges the results into one answer. Every sub-chat stays inspectable.'],
            ].map(([step, title, body]) => (
              <div key={step} className="flex gap-2.5">
                <span className="font-mono text-[9.5px] text-accent">{step}</span>
                <span>
                  <span className="block font-medium text-ink">{title}</span>
                  {body}
                </span>
              </div>
            ))}
          </div>
        </div>
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
