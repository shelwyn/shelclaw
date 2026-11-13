import {
  Ban,
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  Clock,
  Cpu,
  ExternalLink,
  GitBranch,
  Network,
  Pencil,
  Plus,
  Settings2,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAppStore } from '../store'
import type { Agent, Task } from '../types'
import { duration, fmtTokens, modelShort, plural } from '../lib/format'
import { MemoryPanel } from './MemoryPanel'
import { Avatar, Badge, Button, cn, EmptyState, Spinner } from './ui'

function TaskStatusIcon({ status }: { status: Task['status'] }) {
  switch (status) {
    case 'running':
      return <Spinner className="h-3.5 w-3.5 text-accent" />
    case 'queued':
      return <Clock className="h-3.5 w-3.5 text-faint" />
    case 'done':
      return <Check className="h-3.5 w-3.5 text-success" />
    case 'error':
      return <X className="h-3.5 w-3.5 text-danger" />
    case 'cancelled':
      return <Ban className="h-3.5 w-3.5 text-faint" />
    default:
      return <CircleDashed className="h-3.5 w-3.5 text-faint" />
  }
}

function TaskNode({
  task,
  depth,
  childrenByParent,
  agents,
  expanded,
  toggleExpanded,
}: {
  task: Task
  depth: number
  childrenByParent: Map<string, Task[]>
  agents: Agent[]
  expanded: Set<string>
  toggleExpanded: (id: string) => void
}) {
  const openChat = useAppStore((state) => state.openChat)
  const activeChatId = useAppStore((state) => state.activeChatId)
  const agent = agents.find((entry) => entry.id === task.agentId)
  const children = childrenByParent.get(task.id) || []
  const isExpanded = expanded.has(task.id)
  const isActive = task.chatId === activeChatId

  return (
    <div className="relative">
      <div
        className={cn(
          'group rounded-lg border px-2 py-1.5 transition-colors',
          isActive
            ? 'border-accent/35 bg-accent-soft/60'
            : 'border-transparent hover:border-line hover:bg-panel2/70',
        )}
      >
        <div className="flex items-start gap-1.5">
          <button
            type="button"
            onClick={() => toggleExpanded(task.id)}
            className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-faint hover:bg-panel hover:text-ink"
            aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
          >
            {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
          <span className="mt-0.5 flex w-3.5 shrink-0 justify-center">
            <TaskStatusIcon status={task.status} />
          </span>
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => task.chatId && void openChat(task.chatId)}
              className="block w-full text-left"
              title={task.title}
            >
              <span className="line-clamp-2 text-[11.5px] font-medium leading-snug text-ink">
                {task.title}
              </span>
            </button>
            <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[9.5px] text-faint">
              {agent ? (
                <span className="inline-flex items-center gap-1">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: agent.color }}
                  />
                  {agent.name}
                </span>
              ) : null}
              <span className="rounded bg-panel2 px-1 py-px">{modelShort(task.model)}</span>
              {task.startedAt ? <span>{duration(task.startedAt, task.endedAt)}</span> : null}
              {task.usage.total ? <span>{fmtTokens(task.usage.total)} tok</span> : null}
            </div>
          </div>
          {task.chatId ? (
            <button
              type="button"
              onClick={() => void openChat(task.chatId)}
              className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-faint opacity-0 transition-opacity hover:bg-panel hover:text-ink group-hover:opacity-100"
              title="Open sub-agent chat"
            >
              <ExternalLink className="h-3 w-3" />
            </button>
          ) : null}
        </div>

        {isExpanded ? (
          <div className="mt-2 space-y-2 border-t border-line/70 pl-7 pr-1 pt-2">
            {task.instructions ? (
              <div>
                <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-faint">
                  Brief
                </div>
                <div className="scroll-thin mt-0.5 max-h-24 overflow-y-auto whitespace-pre-wrap text-[10px] leading-relaxed text-muted">
                  {task.instructions}
                </div>
              </div>
            ) : null}
            {task.error ? (
              <div className="rounded-md border border-danger/25 bg-danger/5 px-2 py-1.5 text-[10px] leading-relaxed text-danger">
                {task.error}
              </div>
            ) : null}
            {task.result ? (
              <div>
                <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-faint">
                  Result
                </div>
                <div className="scroll-thin mt-0.5 max-h-36 overflow-y-auto whitespace-pre-wrap rounded-md border border-line bg-panel px-2 py-1.5 text-[10px] leading-relaxed text-muted">
                  {task.result}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {children.length ? (
        <div className="ml-[15px] border-l border-line/80 pl-1.5">
          {children.map((child) => (
            <TaskNode
              key={child.id}
              task={child}
              depth={depth + 1}
              childrenByParent={childrenByParent}
              agents={agents}
              expanded={expanded}
              toggleExpanded={toggleExpanded}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function Inspector() {
  const chat = useAppStore((state) => state.detail?.chat || null)
  const allTasks = useAppStore((state) => state.detail?.tasks)
  const runs = useAppStore((state) => state.detail?.runs)
  const orchestrationRunId = useAppStore((state) => state.detail?.orchestrationRunId || '')
  const agents = useAppStore((state) => state.agents)
  const activeRuns = useAppStore((state) => state.activeRuns)
  const inspectorOpen = useAppStore((state) => state.inspectorOpen)
  const inspectorTab = useAppStore((state) => state.inspectorTab)
  const setInspectorTab = useAppStore((state) => state.setInspectorTab)
  const toggleInspector = useAppStore((state) => state.toggleInspector)
  const openModal = useAppStore((state) => state.openModal)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [, setTick] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  if (!inspectorOpen) return null

  const agent = agents.find((entry) => entry.id === chat?.agentId)
  const tasks = (allTasks || []).filter((task) => task.rootRunId === orchestrationRunId)
  const rootTasks = tasks.filter((task) => !task.parentTaskId)
  const childrenByParent = new Map<string, Task[]>()
  for (const task of tasks) {
    if (!task.parentTaskId) continue
    const list = childrenByParent.get(task.parentTaskId) || []
    list.push(task)
    childrenByParent.set(task.parentTaskId, list)
  }

  const running = tasks.filter((task) => task.status === 'running' || task.status === 'queued')
  const done = tasks.filter((task) => task.status === 'done')
  const failed = tasks.filter((task) => task.status === 'error')
  const tokens = tasks.reduce(
    (sum, task) => sum + (task.usage.total ?? (task.usage.input || 0) + (task.usage.output || 0)),
    0,
  )
  const rootRun = runs?.find((run) => run.id === orchestrationRunId)
  const isRunning = Boolean(chat && activeRuns.some((run) => run.chatId === chat.id && run.status === 'running'))
  const progress = tasks.length ? Math.round((done.length / tasks.length) * 100) : 0
  const maxDepth = tasks.reduce((max, task) => Math.max(max, task.depth), 0)

  const toggleExpanded = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const modelChips = [...new Map(tasks.filter((task) => task.model).map((task) => [task.model, task])).values()]

  return (
    <>
      <div
        className="fixed inset-0 z-30 bg-black/35 backdrop-blur-[1px] xl:hidden"
        onClick={toggleInspector}
      />
      <aside className="fixed inset-y-0 right-0 z-40 flex w-[332px] max-w-[85vw] shrink-0 flex-col border-l border-line bg-panel shadow-[-12px_0_40px_-20px_rgba(0,0,0,0.3)] xl:static xl:z-auto xl:shadow-none">
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-3.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/10 text-accent">
            {inspectorTab === 'memory' ? <Brain className="h-3.5 w-3.5" /> : <Network className="h-3.5 w-3.5" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] font-semibold text-ink">
              {inspectorTab === 'memory' ? 'Agent memory' : 'Orchestration'}
            </div>
            <div className="text-[9.5px] text-faint">
              {inspectorTab === 'memory'
                ? 'drag to link · click × to unlink'
                : isRunning
                  ? `live · ${running.length} active`
                  : tasks.length
                    ? 'latest run'
                    : 'no delegated tasks'}
            </div>
          </div>
          <button
            type="button"
            onClick={() => openModal({ type: 'settings', tab: 'workspace' })}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-panel2 hover:text-ink"
            title="Orchestration settings"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={toggleInspector}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-panel2 hover:text-ink"
            aria-label="Close inspector"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex shrink-0 gap-1 border-b border-line p-1.5">
          <button
            type="button"
            onClick={() => setInspectorTab('orchestration')}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-md py-1 text-[10.5px] font-medium transition-colors',
              inspectorTab === 'orchestration'
                ? 'bg-panel2 text-ink'
                : 'text-muted hover:text-ink',
            )}
          >
            <Network className="h-3 w-3" /> Orchestration
          </button>
          <button
            type="button"
            onClick={() => setInspectorTab('memory')}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-md py-1 text-[10.5px] font-medium transition-colors',
              inspectorTab === 'memory' ? 'bg-panel2 text-ink' : 'text-muted hover:text-ink',
            )}
          >
            <Brain className="h-3 w-3" /> Memory
          </button>
        </div>

        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {inspectorTab === 'memory' ? (
            <MemoryPanel />
          ) : !chat ? (
            <EmptyState
              icon={<Network className="h-4 w-4" />}
              title="No chat selected"
              description="Open a chat to see its agent tree and live delegation status."
            />
          ) : (
            <>
              <div className="rounded-xl border border-line bg-gradient-to-b from-panel2/70 to-panel p-3">
                <div className="flex items-center gap-2">
                  <Avatar name={agent?.name || 'Agent'} color={agent?.color} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-semibold text-ink">
                      {agent?.name || 'Agent'}
                      {chat.kind === 'agent' ? (
                        <span className="ml-1 font-normal text-faint">· sub-agent</span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 truncate text-[9.5px] text-faint">
                      <Cpu className="h-2.5 w-2.5" />
                      {modelShort(chat.model) || 'inherit model'}
                    </div>
                  </div>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-medium',
                      isRunning
                        ? 'border-accent/25 bg-accent/10 text-accent'
                        : failed.length
                          ? 'border-danger/25 bg-danger/10 text-danger'
                          : 'border-success/25 bg-success/10 text-success',
                    )}
                  >
                    <span
                      className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        isRunning
                          ? 'bg-accent pulse-soft'
                          : failed.length
                            ? 'bg-danger'
                            : 'bg-success',
                      )}
                    />
                    {isRunning ? 'running' : failed.length ? 'partial' : tasks.length ? 'done' : 'idle'}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line/70 pt-2.5">
                  <div>
                    <div className="text-[9px] uppercase tracking-[0.06em] text-faint">Agents</div>
                    <div className="mt-0.5 text-[12px] font-semibold tabular-nums text-ink">
                      {tasks.length}
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase tracking-[0.06em] text-faint">Tokens</div>
                    <div className="mt-0.5 text-[12px] font-semibold tabular-nums text-ink">
                      {fmtTokens(tokens)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase tracking-[0.06em] text-faint">Elapsed</div>
                    <div className="mt-0.5 text-[12px] font-semibold tabular-nums text-ink">
                      {rootRun ? duration(rootRun.startedAt, rootRun.endedAt) : tasks[0]?.startedAt ? duration(tasks[0].startedAt, null) : '—'}
                    </div>
                  </div>
                </div>

                {tasks.length ? (
                  <div className="mt-2.5">
                    <div className="h-1 overflow-hidden rounded-full bg-panel2">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all duration-500',
                          failed.length ? 'bg-danger' : isRunning ? 'bg-accent' : 'bg-success',
                        )}
                        style={{ width: `${Math.max(progress, isRunning ? 6 : 0)}%` }}
                      />
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[9px] text-faint">
                      <span>
                        {done.length}/{tasks.length} complete
                        {failed.length ? ` · ${failed.length} failed` : ''}
                      </span>
                      <span>
                        depth {maxDepth} · {plural(tasks.length, 'agent')}
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>

              {modelChips.length > 1 ? (
                <div className="mt-2.5 flex flex-wrap gap-1">
                  {modelChips.map((task) => (
                    <Badge key={task.id} tone="neutral" className="max-w-full">
                      <span className="truncate">{modelShort(task.model)}</span>
                    </Badge>
                  ))}
                </div>
              ) : null}

              <div className="mb-1.5 mt-4 flex items-center gap-1.5">
                <GitBranch className="h-3 w-3 text-faint" />
                <span className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-faint">
                  Agent tree
                </span>
                <span className="flex-1" />
                {isRunning ? <Spinner className="h-3 w-3 text-accent" /> : null}
              </div>

              {tasks.length === 0 ? (
                <div className="rounded-xl border border-dashed border-line px-3 py-5 text-center">
                  <Network className="mx-auto h-4 w-4 text-faint" />
                  <div className="mt-2 text-[11.5px] font-medium text-ink">No delegated work yet</div>
                  <p className="mx-auto mt-1 max-w-[230px] text-[10px] leading-relaxed text-muted">
                    Ask for something substantial. {agent?.name || 'The agent'} can fan the work out
                    to specialist agents, each running in parallel.
                  </p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {rootTasks.map((task) => (
                    <TaskNode
                      key={task.id}
                      task={task}
                      depth={1}
                      childrenByParent={childrenByParent}
                      agents={agents}
                      expanded={expanded}
                      toggleExpanded={toggleExpanded}
                    />
                  ))}
                </div>
              )}

              <div className="mb-1.5 mt-5 flex items-center gap-1.5">
                <span className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-faint">
                  Team
                </span>
                <span className="flex-1" />
                <button
                  type="button"
                  onClick={() => openModal({ type: 'agent' })}
                  className="inline-flex items-center gap-0.5 text-[10px] font-medium text-accent hover:underline"
                >
                  <Plus className="h-3 w-3" /> New
                </button>
              </div>
              <div className="space-y-0.5 pb-2">
                {agents.map((member) => (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => openModal({ type: 'agent', id: member.id })}
                    className="group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-panel2"
                  >
                    <Avatar name={member.name} color={member.color} size="xs" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] font-medium text-ink">
                        {member.name}
                      </span>
                      <span className="block truncate text-[9px] text-faint">
                        {member.model || 'inherit model'}
                      </span>
                    </span>
                    {member.canSpawn ? (
                      <span className="rounded bg-accent/10 px-1 py-px text-[8.5px] text-accent">
                        delegates
                      </span>
                    ) : null}
                    <Pencil className="h-2.5 w-2.5 shrink-0 text-faint opacity-0 group-hover:opacity-100" />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="shrink-0 border-t border-line px-3.5 py-2 text-[9.5px] leading-relaxed text-faint">
          {inspectorTab === 'memory'
            ? 'Memory notes and links live inside the project workspace. Linked agents see each other’s notes in their prompts.'
            : 'Sub-agents are isolated: each gets only the brief the parent wrote, its own model, and its own chat you can inspect.'}
        </div>
      </aside>
    </>
  )
}
