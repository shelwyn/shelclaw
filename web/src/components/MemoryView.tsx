import { ArrowLeft, Brain, Link2, MessageSquare, Plus, RefreshCw, Settings, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '../store'
import type { Agent, AgentLink, MemoryGraph } from '../types'
import { relativeTime } from '../lib/format'
import { Avatar, Button, cn, EmptyState, Spinner } from './ui'

interface NodePosition {
  agent: Agent
  x: number
  y: number
}

function MemoryGraphCanvas({ graph }: { graph: MemoryGraph }) {
  const projectId = graph.projectId
  const createMemoryLink = useAppStore((state) => state.createMemoryLink)
  const removeMemoryLink = useAppStore((state) => state.removeMemoryLink)
  const openAgentChat = useAppStore((state) => state.openAgentChat)
  const openModal = useAppStore((state) => state.openModal)
  const chats = useAppStore((state) => state.chats)
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(760)
  const [dragLine, setDragLine] = useState<{
    from: string
    startX: number
    startY: number
    x: number
    y: number
  } | null>(null)
  const dragRef = useRef<{ from: string } | null>(null)

  const height = 470
  const centerY = height / 2

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const measure = () => setWidth(element.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const positions = useMemo<NodePosition[]>(() => {
    const count = graph.agents.length
    if (!count) return []
    if (count === 1) return [{ agent: graph.agents[0], x: width / 2, y: centerY }]
    const radius = Math.max(90, Math.min(width * 0.3, 205))
    return graph.agents.map((agent, index) => {
      const angle = -Math.PI / 2 + (index / count) * Math.PI * 2
      return {
        agent,
        x: width / 2 + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius * 0.82,
      }
    })
  }, [graph.agents, width])

  const positionMap = useMemo(
    () => new Map(positions.map((position) => [position.agent.id, position])),
    [positions],
  )

  const memoryCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const memory of graph.memories) {
      counts.set(memory.agentId, (counts.get(memory.agentId) || 0) + 1)
    }
    return counts
  }, [graph.memories])

  const busyAgent = (agentId: string) =>
    chats.find(
      (chat) =>
        chat.agentId === agentId &&
        chat.status === 'running' &&
        !chat.archivedAt &&
        chat.projectId === projectId,
    )

  useEffect(() => {
    if (!dragLine) return
    const move = (event: PointerEvent) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      setDragLine((current) =>
        current
          ? { ...current, x: event.clientX - rect.left, y: event.clientY - rect.top }
          : current,
      )
    }
    const up = (event: PointerEvent) => {
      const from = dragRef.current?.from
      const target = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>('[data-memory-agent]')
      const to = target?.dataset.memoryAgent
      if (from && to && from !== to) void createMemoryLink(from, to)
      dragRef.current = null
      setDragLine(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up, { once: true })
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [Boolean(dragLine), createMemoryLink])

  const beginDrag = (agentId: string, event: React.PointerEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const position = positionMap.get(agentId)
    if (!position) return
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    dragRef.current = { from: agentId }
    setDragLine({
      from: agentId,
      startX: position.x,
      startY: position.y,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    })
  }

  if (graph.agents.length === 0) {
    return (
      <EmptyState
        icon={<Brain className="h-4 w-4" />}
        title="No agents to connect"
        description="Create agents in this project, then link them here to share memory."
        action={
          <Button size="sm" variant="secondary" onClick={() => openModal({ type: 'agent' })}>
            <Plus className="h-3.5 w-3.5" /> New agent
          </Button>
        }
      />
    )
  }

  return (
    <div>
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden rounded-2xl border border-line bg-panel2/30"
        style={{ height }}
      >
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-40" />
        <svg className="absolute inset-0 h-full w-full" width={width} height={height}>
          {graph.links.map((link) => {
            const a = positionMap.get(link.agentA)
            const b = positionMap.get(link.agentB)
            if (!a || !b) return null
            const midX = (a.x + b.x) / 2
            const midY = (a.y + b.y) / 2
            return (
              <g
                key={link.id}
                className="group cursor-pointer"
                onClick={() => void removeMemoryLink(link.id)}
              >
                <title>Click to unlink these agents</title>
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="var(--line-strong)"
                  strokeWidth={2}
                />
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="transparent"
                  strokeWidth={18}
                />
                <circle
                  cx={midX}
                  cy={midY}
                  r={9}
                  fill="var(--panel)"
                  stroke="var(--line-strong)"
                  strokeWidth={1.5}
                  className="transition-colors group-hover:stroke-danger"
                />
                <text
                  x={midX}
                  y={midY + 3.5}
                  textAnchor="middle"
                  fontSize={10}
                  fill="var(--muted)"
                  className="select-none group-hover:fill-danger"
                >
                  ×
                </text>
              </g>
            )
          })}
          {dragLine ? (
            <line
              x1={dragLine.startX}
              y1={dragLine.startY}
              x2={dragLine.x}
              y2={dragLine.y}
              stroke="var(--accent)"
              strokeWidth={2}
              strokeDasharray="6 4"
            />
          ) : null}
        </svg>

        {positions.map(({ agent, x, y }) => {
          const busy = busyAgent(agent.id)
          const memoryCount = memoryCounts.get(agent.id) || 0
          return (
            <div
              key={agent.id}
              data-memory-agent={agent.id}
              className={cn(
                'absolute flex w-[132px] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border bg-panel px-2.5 py-2 shadow-sm transition-colors sm:w-[156px]',
                busy ? 'border-accent/40' : 'border-line hover:border-accent/30',
              )}
              style={{ left: x, top: y }}
            >
              <div className="flex items-center gap-2">
                <span className="relative shrink-0">
                  <Avatar name={agent.name} color={agent.color} size="sm" />
                  {busy ? (
                    <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full border border-panel bg-panel">
                      <Spinner className="h-2 w-2 text-accent" />
                    </span>
                  ) : null}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11.5px] font-semibold text-ink">{agent.name}</div>
                  <div className="truncate text-[9.5px] text-faint">
                    {busy ? `working: ${busy.title}` : agent.isOrchestrator ? 'orchestrator' : 'agent'}
                  </div>
                </div>
                <button
                  type="button"
                  onPointerDown={(event) => beginDrag(agent.id, event)}
                  className="flex h-5 w-5 shrink-0 cursor-crosshair items-center justify-center rounded-full border border-dashed border-line-strong text-faint hover:border-accent hover:text-accent"
                  title="Drag to another agent to link memory"
                  aria-label={`Link ${agent.name} memory`}
                  style={{ touchAction: 'none' }}
                >
                  <Link2 className="h-2.5 w-2.5" />
                </button>
              </div>
              <div className="mt-1.5 flex items-center gap-1 border-t border-line/70 pt-1.5">
                <button
                  type="button"
                  onClick={() => void openAgentChat(agent.id)}
                  className="inline-flex items-center gap-1 text-[9.5px] text-muted hover:text-accent"
                >
                  <MessageSquare className="h-2.5 w-2.5" /> chat
                </button>
                <span className="flex-1" />
                <span className="text-[9px] text-faint">
                  {memoryCount} memor{memoryCount === 1 ? 'y' : 'ies'}
                </span>
                <button
                  type="button"
                  onClick={() => openModal({ type: 'agent', id: agent.id })}
                  className="inline-flex h-4 w-4 items-center justify-center rounded text-faint hover:bg-panel2 hover:text-ink"
                  aria-label={`Edit ${agent.name}`}
                >
                  <Settings className="h-2.5 w-2.5" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
      <p className="mt-2 text-[10.5px] leading-relaxed text-faint">
        Drag from the <Link2 className="inline h-3 w-3" /> handle on one agent to another to share
        memory. Click the × on a line to unlink. Linked agents can read each other's recent memory
        when they run.
      </p>
    </div>
  )
}

export function MemoryView() {
  const projects = useAppStore((state) => state.projects)
  const activeProjectId = useAppStore((state) => state.activeProjectId)
  const graph = useAppStore((state) => state.memory)
  const loading = useAppStore((state) => state.memoryLoading)
  const refreshMemory = useAppStore((state) => state.refreshMemory)
  const setActiveProject = useAppStore((state) => state.setActiveProject)
  const openAgentChat = useAppStore((state) => state.openAgentChat)
  const openModal = useAppStore((state) => state.openModal)

  const project = projects.find((entry) => entry.id === activeProjectId)

  if (!project) {
    return (
      <main className="flex flex-1 items-center justify-center bg-bg">
        <EmptyState
          icon={<Brain className="h-4 w-4" />}
          title="No project selected"
          description="Create a project to build its agent memory graph."
          action={
            <Button size="sm" variant="primary" onClick={() => openModal({ type: 'project' })}>
              <Plus className="h-3.5 w-3.5" /> New project
            </Button>
          }
        />
      </main>
    )
  }

  const linkedIds = new Set<string>()
  for (const link of graph?.links || []) {
    linkedIds.add(link.agentA)
    linkedIds.add(link.agentB)
  }

  return (
    <main className="scroll-thin flex min-w-0 flex-1 flex-col overflow-y-auto bg-bg">
      <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-panel/80 px-4 backdrop-blur-sm">
        <button
          type="button"
          onClick={() => setActiveProject(project.id)}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12px] text-muted hover:bg-panel2 hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Chats
        </button>
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <div className="flex items-center gap-1.5">
            <Brain className="h-3.5 w-3.5 text-accent" />
            <span className="truncate text-[13px] font-semibold text-ink">Agent memory</span>
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: project.color }}
            />
            <span className="truncate text-[10px] text-faint">{project.name}</span>
          </div>
          <div className="text-[9.5px] text-faint">
            {graph?.agents.length || 0} agents · {graph?.links.length || 0} links ·{' '}
            {graph?.memories.length || 0} notes
          </div>
        </div>
        <button
          type="button"
          onClick={() => void refreshMemory()}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-panel2 hover:text-ink"
          title="Refresh memory graph"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'spin')} />
        </button>
      </header>

      <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6">
        {loading && !graph ? (
          <div className="flex items-center justify-center py-24">
            <Spinner className="h-5 w-5 text-accent" />
          </div>
        ) : !graph ? (
          <EmptyState
            icon={<Brain className="h-4 w-4" />}
            title="Memory graph unavailable"
            description="Refresh to load this project's agent memory."
            action={
              <Button size="sm" variant="secondary" onClick={() => void refreshMemory()}>
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </Button>
            }
          />
        ) : (
          <>
            <MemoryGraphCanvas graph={graph} />

            <div className="mt-6 flex items-center justify-between">
              <div>
                <div className="text-[11.5px] font-semibold text-ink">Recent shared memory</div>
                <div className="mt-0.5 text-[10.5px] text-faint">
                  Notes are captured automatically when delegated tasks finish. Linked agents see
                  each other's notes.
                </div>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => openModal({ type: 'agent' })}
              >
                <Plus className="h-3.5 w-3.5" /> Agent
              </Button>
            </div>

            {graph.memories.length === 0 ? (
              <div className="mt-3 rounded-xl border border-dashed border-line px-4 py-8 text-center text-[11px] text-faint">
                No memory notes yet. Delegate a task to an agent; its result is recorded here.
              </div>
            ) : (
              <div className="mt-3 space-y-1.5 pb-6">
                {graph.memories.slice(0, 20).map((memory) => {
                  const agent = graph.agents.find((entry) => entry.id === memory.agentId)
                  return (
                    <div
                      key={memory.id}
                      className="rounded-xl border border-line bg-panel px-3 py-2.5"
                    >
                      <div className="flex items-center gap-2">
                        <Avatar
                          name={agent?.name || 'Agent'}
                          color={agent?.color}
                          size="xs"
                        />
                        <span className="text-[11px] font-medium text-ink">
                          {agent?.name || 'Agent'}
                        </span>
                        <span className="truncate text-[10px] text-faint">{memory.title}</span>
                        <span className="flex-1" />
                        {linkedIds.has(memory.agentId) ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-1.5 py-0.5 text-[9px] text-accent">
                            <Link2 className="h-2.5 w-2.5" /> shared
                          </span>
                        ) : null}
                        <span className="text-[9px] text-faint">
                          {relativeTime(memory.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[10.5px] leading-relaxed text-muted">
                        {memory.content}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}
