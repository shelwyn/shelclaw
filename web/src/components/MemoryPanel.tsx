import {
  Brain,
  Link2,
  Maximize2,
  MessageSquare,
  Minimize2,
  Plus,
  RefreshCw,
  Settings,
  X,
} from 'lucide-react'
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

interface NodeOverride {
  x: number
  y: number
}

function MemoryCanvas({
  graph,
  expanded,
  onOpenAgentMemory,
}: {
  graph: MemoryGraph
  expanded: boolean
  onOpenAgentMemory: (agentId: string) => void
}) {
  const createMemoryLink = useAppStore((state) => state.createMemoryLink)
  const removeMemoryLink = useAppStore((state) => state.removeMemoryLink)
  const openAgentChat = useAppStore((state) => state.openAgentChat)
  const openModal = useAppStore((state) => state.openModal)
  const chats = useAppStore((state) => state.chats)
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(290)
  const [canvasHeight, setCanvasHeight] = useState(240)
  const [overrides, setOverrides] = useState<Record<string, NodeOverride>>({})
  const [dragLine, setDragLine] = useState<{
    startX: number
    startY: number
    x: number
    y: number
  } | null>(null)
  const dragRef = useRef<{ from: string } | null>(null)
  const [moveDrag, setMoveDrag] = useState<{
    agentId: string
    offsetX: number
    offsetY: number
    startX: number
    startY: number
    moved: boolean
  } | null>(null)

  const columns = width >= 860 ? 5 : width >= 680 ? 4 : width >= 470 ? 3 : 2
  const gap = 10
  const nodeWidth = Math.max(118, (width - gap * (columns - 1)) / columns)
  const rows = Math.max(1, Math.ceil(graph.agents.length / columns))
  const rowHeight = expanded
    ? Math.max(118, Math.floor(canvasHeight / rows))
    : 88
  const height = expanded
    ? Math.max(canvasHeight, rows * rowHeight, 320)
    : Math.max(140, rows * rowHeight)

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const measure = () => {
      setWidth(element.clientWidth)
      setCanvasHeight(element.clientHeight)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [expanded])

  const defaultPositions = useMemo<Position[]>(
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
    [graph.agents, nodeWidth, rowHeight],
  )

  const positions = useMemo<Position[]>(
    () =>
      defaultPositions.map((position) => {
        const override = overrides[position.agent.id]
        return override ? { ...position, x: override.x, y: override.y } : position
      }),
    [defaultPositions, overrides],
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

  useEffect(() => {
    if (!moveDrag) return
    const move = (event: PointerEvent) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const nextX = Math.min(
        Math.max(56, event.clientX - rect.left - moveDrag.offsetX),
        Math.max(56, rect.width - 56),
      )
      const nextY = Math.min(
        Math.max(34, event.clientY - rect.top - moveDrag.offsetY),
        Math.max(34, rect.height - 34),
      )
      const moved =
        moveDrag.moved ||
        Math.abs(event.clientX - moveDrag.startX) > 3 ||
        Math.abs(event.clientY - moveDrag.startY) > 3
      if (moved !== moveDrag.moved) setMoveDrag({ ...moveDrag, moved })
      setOverrides((current) => ({
        ...current,
        [moveDrag.agentId]: { x: nextX, y: nextY },
      }))
    }
    const up = () => {
      if (!moveDrag.moved) onOpenAgentMemory(moveDrag.agentId)
      setMoveDrag(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up, { once: true })
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [moveDrag, onOpenAgentMemory])

  const beginLinkDrag = (agentId: string, event: React.PointerEvent) => {
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

  const beginMoveDrag = (agentId: string, event: React.PointerEvent) => {
    if ((event.target as HTMLElement).closest('button')) return
    const rect = containerRef.current?.getBoundingClientRect()
    const position = positionMap.get(agentId)
    if (!rect || !position) return
    event.preventDefault()
    setMoveDrag({
      agentId,
      offsetX: event.clientX - rect.left - position.x,
      offsetY: event.clientY - rect.top - position.y,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
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
      className={cn(
        'relative w-full overflow-hidden rounded-xl border border-line bg-panel2/30',
        expanded && 'h-full flex-1',
      )}
      style={{ height: expanded ? '100%' : height }}
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
              'absolute flex -translate-x-1/2 -translate-y-1/2 cursor-grab flex-col rounded-lg border bg-panel px-2 py-1.5 shadow-sm active:cursor-grabbing',
              busy ? 'border-accent/40' : 'border-line',
              moveDrag?.agentId === agent.id && 'z-10 shadow-md',
            )}
            style={{ left: x, top: y, width: nodeWidth - 6, touchAction: 'none' }}
            onPointerDown={(event) => beginMoveDrag(agent.id, event)}
            title="Drag to move. Click to read all memory."
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
                onPointerDown={(event) => beginLinkDrag(agent.id, event)}
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
                title={`Edit ${agent.name}`}
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

function MemoryDetailModal({
  graph,
  agentId,
  onClose,
}: {
  graph: MemoryGraph
  agentId: string
  onClose: () => void
}) {
  const agent = graph.agents.find((entry) => entry.id === agentId)
  const memories = graph.memories
    .filter((memory) => memory.agentId === agentId)
    .sort((a, b) => b.createdAt - a.createdAt)

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/45 backdrop-blur-[1px]" onClick={onClose} />
      <div className="fixed inset-x-4 top-1/2 z-[61] mx-auto flex max-h-[78vh] max-w-xl -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-2xl sm:inset-x-auto sm:left-1/2 sm:w-[560px] sm:-translate-x-1/2">
        <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-3">
          <Avatar name={agent?.name || 'Agent'} color={agent?.color} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold text-ink">
              {agent?.name || 'Agent'} memory
            </div>
            <div className="text-[10px] text-faint">
              {memories.length} recent note{memories.length === 1 ? '' : 's'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-panel2 hover:text-ink"
            aria-label="Close memory"
            title="Close memory"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-3">
          {memories.length === 0 ? (
            <div className="px-2 py-8 text-center text-[11.5px] text-faint">
              No memory notes yet. Delegated task results are recorded automatically.
            </div>
          ) : (
            <div className="space-y-2">
              {memories.map((memory) => (
                <div key={memory.id} className="rounded-lg border border-line bg-panel2/30 p-3">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-ink">
                      {memory.title || 'Memory note'}
                    </span>
                    <span className="shrink-0 text-[9.5px] text-faint">
                      {relativeTime(memory.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words text-[11.5px] leading-relaxed text-muted">
                    {memory.content}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export function MemoryPanel() {
  const graph = useAppStore((state) => state.memory)
  const loading = useAppStore((state) => state.memoryLoading)
  const refreshMemory = useAppStore((state) => state.refreshMemory)
  const activeProjectId = useAppStore((state) => state.activeProjectId)
  const openModal = useAppStore((state) => state.openModal)
  const [expanded, setExpanded] = useState(false)
  const [selectedAgentId, setSelectedAgentId] = useState('')

  useEffect(() => {
    if (activeProjectId && !graph) void refreshMemory()
  }, [activeProjectId, graph, refreshMemory])

  useEffect(() => {
    if (!expanded && !selectedAgentId) return
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (selectedAgentId) setSelectedAgentId('')
      else if (expanded) setExpanded(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [expanded, selectedAgentId])

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

  const modal = selectedAgentId ? (
    <MemoryDetailModal
      graph={graph}
      agentId={selectedAgentId}
      onClose={() => setSelectedAgentId('')}
    />
  ) : null

  const stats = (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-faint">
        {graph.agents.length} agents · {graph.links.length} links · {graph.memories.length} notes
      </span>
      <span className="flex-1" />
      <span className="hidden text-[9.5px] text-faint sm:inline">
        drag tiles to move · link handle to connect
      </span>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="inline-flex h-6 w-6 items-center justify-center rounded text-faint hover:bg-panel2 hover:text-ink"
        title={expanded ? 'Collapse memory graph' : 'Expand memory graph'}
      >
        {expanded ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
      </button>
      <button
        type="button"
        onClick={() => void refreshMemory()}
        className="inline-flex h-6 w-6 items-center justify-center rounded text-faint hover:bg-panel2 hover:text-ink"
        title="Refresh memory"
      >
        <RefreshCw className={cn('h-3 w-3', loading && 'spin')} />
      </button>
    </div>
  )

  if (expanded) {
    return (
      <>
        <div className="fixed inset-0 z-50 flex flex-col bg-bg p-3 sm:p-5">
          <div className="flex h-10 shrink-0 items-center gap-2">
            <Brain className="h-4 w-4 text-accent" />
            <span className="text-[14px] font-semibold text-ink">Agent memory</span>
            <span className="text-[10px] text-faint">
              {graph.agents.length} agents · {graph.links.length} links
            </span>
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-panel2 hover:text-ink"
              aria-label="Collapse memory graph"
              title="Collapse"
            >
              <Minimize2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => void refreshMemory()}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-panel2 hover:text-ink"
              title="Refresh memory"
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'spin')} />
            </button>
          </div>
          <div className="mt-2 flex min-h-0 flex-1">
            <MemoryCanvas
              graph={graph}
              expanded
              onOpenAgentMemory={setSelectedAgentId}
            />
          </div>
          <div className="shrink-0 pt-2 text-[10px] text-faint">
            Drag a tile to move it. Drag the dashed link handle onto another agent to share memory.
            Click a tile to read all memory. Click × on a line to unlink.
          </div>
        </div>
        {modal}
      </>
    )
  }

  return (
    <>
      <div className="space-y-3">
        {stats}
        <MemoryCanvas graph={graph} expanded={false} onOpenAgentMemory={setSelectedAgentId} />
        <p className="text-[9.5px] leading-relaxed text-faint">
          Drag the <Link2 className="inline h-2.5 w-2.5" /> handle onto another agent to share
          memory. Click an agent to read all of its memory.
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
                  <button
                    key={memory.id}
                    type="button"
                    onClick={() => setSelectedAgentId(memory.agentId)}
                    className="w-full rounded-lg border border-line bg-panel px-2 py-1.5 text-left transition-colors hover:border-accent/30"
                  >
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
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
      {modal}
    </>
  )
}
