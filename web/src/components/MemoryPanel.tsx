import { Brain, Link2, MessageSquare, Plus, RefreshCw, Settings } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '../store'
import type { Agent, MemoryGraph } from '../types'
import { relativeTime } from '../lib/format'
import { Avatar, Button, cn, EmptyState, Spinner } from './ui'

interface Position {
  agent: Agent
  x: number
  y: number
}

function MemoryCanvas({ graph }: { graph: MemoryGraph }) {
  const createMemoryLink = useAppStore((state) => state.createMemoryLink)
  const removeMemoryLink = useAppStore((state) => state.removeMemoryLink)
  const openAgentChat = useAppStore((state) => state.openAgentChat)
  const openModal = useAppStore((state) => state.openModal)
  const chats = useAppStore((state) => state.chats)
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(290)
  const [dragLine, setDragLine] = useState<{
    startX: number
    startY: number
    x: number
    y: number
  } | null>(null)
  const dragRef = useRef<{ from: string } | null>(null)

  const columns = 2
  const gap = 8
  const rowHeight = 84
  const nodeWidth = Math.max(112, (width - gap) / columns)
  const rows = Math.ceil(graph.agents.length / columns)
  const height = Math.max(120, rows * rowHeight)

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const measure = () => setWidth(element.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const positions = useMemo<Position[]>(
    () =>
      graph.agents.map((agent, index) => {
        const row = Math.floor(index / columns)
        const column = index % columns
        return {
          agent,
          x: column * (nodeWidth + gap) + nodeWidth / 2,
          y: row * rowHeight + rowHeight / 2,
        }
      }),
    [graph.agents, nodeWidth],
  )
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
        chat.projectId === graph.projectId,
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
    const rect = containerRef.current?.getBoundingClientRect()
    if (!position || !rect) return
    dragRef.current = { from: agentId }
    setDragLine({
      startX: position.x,
      startY: position.y,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    })
  }

  if (!graph.agents.length) {
    return (
      <EmptyState
        icon={<Brain className="h-4 w-4" />}
        title="No agents to link"
        description="Create agents in this project, then link their memory here."
        action={
          <Button size="sm" variant="secondary" onClick={() => openModal({ type: 'agent' })}>
            <Plus className="h-3.5 w-3.5" /> New agent
          </Button>
        }
        className="py-8"
      />
    )
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-xl border border-line bg-panel2/30"
      style={{ height }}
    >
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-30" />
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
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--line-strong)" strokeWidth={1.5} />
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={14} />
              <circle
                cx={midX}
                cy={midY}
                r={7}
                fill="var(--panel)"
                stroke="var(--line-strong)"
                strokeWidth={1.2}
                className="group-hover:stroke-danger"
              />
              <text
                x={midX}
                y={midY + 2.5}
                textAnchor="middle"
                fontSize={9}
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
            strokeWidth={1.5}
            strokeDasharray="5 4"
          />
        ) : null}
      </svg>

      {positions.map(({ agent, x, y }) => {
        const busy = busyAgent(agent.id)
        return (
          <div
            key={agent.id}
            data-memory-agent={agent.id}
            className={cn(
              'absolute flex -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border bg-panel px-1.5 py-1.5 shadow-sm',
              busy ? 'border-accent/40' : 'border-line',
            )}
            style={{ left: x, top: y, width: nodeWidth - 4 }}
          >
            <div className="flex items-center gap-1.5">
              <span className="relative shrink-0">
                <Avatar name={agent.name} color={agent.color} size="xs" />
                {busy ? (
                  <span className="absolute -bottom-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full border border-panel bg-panel">
                    <Spinner className="h-2 w-2 text-accent" />
                  </span>
                ) : null}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[10.5px] font-semibold text-ink">{agent.name}</div>
                <div className="truncate text-[8.5px] text-faint">
                  {busy ? 'working' : `${memoryCounts.get(agent.id) || 0} notes`}
                </div>
              </div>
              <button
                type="button"
                onPointerDown={(event) => beginDrag(agent.id, event)}
                className="flex h-4.5 w-4.5 shrink-0 cursor-crosshair items-center justify-center rounded-full border border-dashed border-line-strong text-faint hover:border-accent hover:text-accent"
                title="Drag to another agent to link memory"
                aria-label={`Link ${agent.name} memory`}
                style={{ touchAction: 'none' }}
              >
                <Link2 className="h-2.5 w-2.5" />
              </button>
            </div>
            <div className="mt-1 flex items-center gap-1 border-t border-line/60 pt-1">
              <button
                type="button"
                onClick={() => void openAgentChat(agent.id)}
                className="inline-flex items-center gap-0.5 text-[8.5px] text-muted hover:text-accent"
              >
                <MessageSquare className="h-2.5 w-2.5" /> chat
              </button>
              <span className="flex-1" />
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
  )
}

export function MemoryPanel() {
  const graph = useAppStore((state) => state.memory)
  const loading = useAppStore((state) => state.memoryLoading)
  const refreshMemory = useAppStore((state) => state.refreshMemory)
  const activeProjectId = useAppStore((state) => state.activeProjectId)
  const openModal = useAppStore((state) => state.openModal)

  useEffect(() => {
    if (activeProjectId && !graph) void refreshMemory()
  }, [activeProjectId, graph, refreshMemory])

  if (loading && !graph) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner className="h-5 w-5 text-accent" />
      </div>
    )
  }

  if (!graph) {
    return (
      <EmptyState
        icon={<Brain className="h-4 w-4" />}
        title="Memory unavailable"
        description="Create a project and agents to start sharing memory."
        action={
          <Button size="sm" variant="secondary" onClick={() => void refreshMemory()}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        }
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-faint">
          {graph.agents.length} agents · {graph.links.length} links · {graph.memories.length} notes
        </span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => void refreshMemory()}
          className="inline-flex h-6 w-6 items-center justify-center rounded text-faint hover:bg-panel2 hover:text-ink"
          title="Refresh memory"
        >
          <RefreshCw className={cn('h-3 w-3', loading && 'spin')} />
        </button>
      </div>

      <MemoryCanvas graph={graph} />

      <p className="text-[9.5px] leading-relaxed text-faint">
        Drag from the <Link2 className="inline h-2.5 w-2.5" /> handle on one agent to another to
        share memory. Click × on a line to unlink.
      </p>

      <div>
        <div className="mb-1.5 flex items-center gap-1.5">
          <span className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-faint">
            Recent memory
          </span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => openModal({ type: 'agent' })}
            className="inline-flex items-center gap-0.5 text-[9.5px] font-medium text-accent hover:underline"
          >
            <Plus className="h-3 w-3" /> Agent
          </button>
        </div>
        {graph.memories.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line px-3 py-5 text-center text-[10px] text-faint">
            Delegated task results become memory notes automatically.
          </div>
        ) : (
          <div className="space-y-1">
            {graph.memories.slice(0, 8).map((memory) => {
              const agent = graph.agents.find((entry) => entry.id === memory.agentId)
              return (
                <div key={memory.id} className="rounded-lg border border-line bg-panel px-2 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <Avatar name={agent?.name || 'Agent'} color={agent?.color} size="xs" />
                    <span className="min-w-0 flex-1 truncate text-[9.5px] font-medium text-ink">
                      {agent?.name || 'Agent'}
                      <span className="ml-1 font-normal text-faint">{memory.title}</span>
                    </span>
                    <span className="shrink-0 text-[8.5px] text-faint">
                      {relativeTime(memory.createdAt)}
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap text-[9.5px] leading-relaxed text-muted">
                    {memory.content}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
