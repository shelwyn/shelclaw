import {
  ArrowDown,
  Ban,
  Brain,
  Check,
  ChevronRight,
  CircleDashed,
  Clock,
  Download,
  FileText,
  GitBranch,
  Layers,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { useAppStore } from '../store'
import type { Agent, Message, Task, ToolCall } from '../types'
import { fmtTokens, modelShort, relativeTime, timeOfDay, totalTokens } from '../lib/format'
import { Markdown } from './Markdown'
import { Avatar, Badge, cn, Spinner } from './ui'

function TypingDots() {
  return (
    <div className="flex items-center gap-1.5 py-1.5">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="h-1.5 w-1.5 rounded-full bg-accent/70"
          style={{
            animation: 'soft-pulse 1.2s ease-in-out infinite',
            animationDelay: `${index * 0.16}s`,
          }}
        />
      ))}
    </div>
  )
}

function parseTasks(call: ToolCall): Array<{ title: string; agent?: string; model?: string }> {
  try {
    const parsed = JSON.parse(call.arguments || '{}')
    if (Array.isArray(parsed.tasks)) {
      return parsed.tasks.map((task: any) => ({
        title: String(task.title || task.instructions?.slice(0, 60) || 'Untitled task'),
        agent: task.agent,
        model: task.model,
      }))
    }
  } catch {
    // invalid streaming arguments
  }
  return []
}

function statusIcon(status: Task['status']) {
  switch (status) {
    case 'running':
      return <Spinner className="h-3 w-3 text-accent" />
    case 'queued':
      return <Clock className="h-3 w-3 text-faint" />
    case 'done':
      return <Check className="h-3 w-3 text-success" />
    case 'error':
      return <X className="h-3 w-3 text-danger" />
    case 'cancelled':
      return <Ban className="h-3 w-3 text-faint" />
    default:
      return <CircleDashed className="h-3 w-3 text-faint" />
  }
}

function SpawnCard({
  call,
  message,
  tasks,
  onOpenInspector,
}: {
  call: ToolCall
  message: Message
  tasks: Task[]
  onOpenInspector: () => void
}) {
  const openChat = useAppStore((state) => state.openChat)
  const specs = parseTasks(call)
  if (!specs.length) return null

  const matched = tasks.filter(
    (task) =>
      task.createdAt >= message.createdAt - 1500 &&
      specs.some((spec) => spec.title === task.title),
  )
  const running = matched.filter((task) => task.status === 'running' || task.status === 'queued').length
  const done = matched.filter((task) => task.status === 'done').length

  return (
    <div className="my-2.5 overflow-hidden rounded-xl border border-line bg-panel2/45">
      <div className="flex items-center gap-2 border-b border-line/80 px-3 py-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-accent/10 text-accent">
          <GitBranch className="h-3 w-3" />
        </span>
        <span className="text-[11.5px] font-medium text-ink">
          {running ? 'Delegating to' : 'Delegated to'} {specs.length} agent{specs.length === 1 ? '' : 's'}
        </span>
        <span className="flex-1" />
        {matched.length ? (
          <span className="text-[10px] text-faint">
            {done}/{specs.length} complete
          </span>
        ) : null}
        <button
          type="button"
          onClick={onOpenInspector}
          className="inline-flex items-center gap-0.5 text-[10.5px] font-medium text-accent hover:underline"
        >
          Orchestration <ChevronRight className="h-3 w-3" />
        </button>
      </div>
      <div className="divide-y divide-line/70">
        {specs.map((spec, index) => {
          const task = matched.find((entry) => entry.title === spec.title)
          return (
            <button
              key={`${spec.title}-${index}`}
              type="button"
              disabled={!task?.chatId}
              onClick={() => task?.chatId && void openChat(task.chatId)}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors',
                task?.chatId ? 'hover:bg-panel' : 'cursor-default',
              )}
            >
              <span className="flex w-3.5 shrink-0 justify-center">
                {task ? statusIcon(task.status) : <CircleDashed className="h-3 w-3 text-faint" />}
              </span>
              <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink">{spec.title}</span>
              <span className="shrink-0 rounded bg-panel px-1.5 py-0.5 text-[9.5px] text-faint">
                {task?.agentId
                  ? useAppStore.getState().agents.find((agent) => agent.id === task.agentId)?.name || 'agent'
                  : spec.agent || 'inherit'}
              </span>
              {spec.model || task?.model ? (
                <span className="hidden shrink-0 text-[9.5px] text-faint sm:inline">
                  {modelShort(spec.model || task?.model || '')}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function AgentReport({ message }: { message: Message }) {
  const agents = useAppStore((state) => state.agents)
  const openChat = useAppStore((state) => state.openChat)
  const metadata = (message.metadata || {}) as Record<string, unknown>
  const agent = agents.find((entry) => entry.id === metadata.agentId)
  const status = String(metadata.status || 'done')
  const childChatId = typeof metadata.childChatId === 'string' ? metadata.childChatId : ''
  const title = typeof metadata.title === 'string' ? metadata.title : ''

  return (
    <div
      className={cn(
        'fade-up overflow-hidden rounded-xl border bg-panel',
        status === 'error' ? 'border-danger/30' : 'border-line',
      )}
    >
      <div className="flex items-center gap-2 border-b border-line bg-panel2/40 px-3 py-2">
        <Avatar name={message.name || 'Agent'} color={agent?.color} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[11.5px] font-semibold text-ink">
              {message.name || 'Agent'}
            </span>
            <span className="text-[9.5px] text-faint">finished a task</span>
            {status === 'done' ? (
              <Badge tone="success">done</Badge>
            ) : status === 'error' ? (
              <Badge tone="danger">failed</Badge>
            ) : (
              <Badge tone="warn">stopped</Badge>
            )}
          </div>
          <div className="truncate text-[9.5px] text-faint">
            {title}
            {metadata.model ? ` · ${String(metadata.model)}` : ''}
          </div>
        </div>
        <span className="shrink-0 text-[9px] text-faint">
          {relativeTime(message.createdAt)}
        </span>
        {childChatId ? (
          <button
            type="button"
            onClick={() => void openChat(childChatId)}
            className="shrink-0 rounded-md px-1.5 py-1 text-[9.5px] font-medium text-accent hover:bg-accent-soft"
          >
            Open chat
          </button>
        ) : null}
      </div>
      <div className="px-3 py-2.5">
        <Markdown content={message.content || '(No output.)'} />
      </div>
    </div>
  )
}

function AssistantMessage({
  message,
  agent,
  tasks,
  onOpenInspector,
}: {
  message: Message
  agent?: Agent
  tasks: Task[]
  onOpenInspector: () => void
}) {
  const chatModel = useAppStore((state) => state.detail?.chat.model || 'harness default')
  const streaming = message.status === 'streaming'
  const spawnCalls = message.toolCalls.filter((call) => call.name === 'spawn_agents')
  const tokens = totalTokens(message.usage)

  return (
    <div className="fade-up flex gap-3">
      <Avatar name={agent?.name || 'Agent'} color={agent?.color} size="md" className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
          <span className="font-semibold text-ink">{agent?.name || 'Agent'}</span>
          <span className="rounded bg-panel2 px-1.5 py-0.5 text-[9.5px] text-faint">
            {chatModel}
          </span>
          <span className="text-faint">{timeOfDay(message.createdAt)}</span>
          {streaming ? (
            <span className="inline-flex items-center gap-1 text-accent">
              <span className="h-1.5 w-1.5 rounded-full bg-accent pulse-soft" />
              generating
            </span>
          ) : null}
          {message.status === 'cancelled' ? <Badge tone="warn">stopped</Badge> : null}
          {tokens ? <span className="text-faint">· {fmtTokens(tokens)} tokens</span> : null}
        </div>

        {message.reasoning ? (
          <details className="mb-2 rounded-lg border border-line bg-panel2/40 px-2.5 py-1.5">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[10.5px] font-medium text-muted">
              <Brain className="h-3 w-3" />
              Reasoning
              <ChevronRight className="h-3 w-3 transition-transform open:rotate-90" />
            </summary>
            <div className="scroll-thin mt-1.5 max-h-56 overflow-y-auto whitespace-pre-wrap text-[11.5px] leading-relaxed text-muted">
              {message.reasoning}
            </div>
          </details>
        ) : null}

        {spawnCalls.map((call) => (
          <SpawnCard
            key={call.id}
            call={call}
            message={message}
            tasks={tasks}
            onOpenInspector={onOpenInspector}
          />
        ))}

        {message.content ? (
          <div className={cn(message.status === 'error' && 'rounded-lg border border-danger/25 bg-danger/5 px-3 py-2')}>
            <Markdown content={message.content} />
            {streaming ? <span className="stream-caret" /> : null}
          </div>
        ) : streaming || (message.status === 'complete' && spawnCalls.length === 0) ? (
          <TypingDots />
        ) : null}
      </div>
    </div>
  )
}

interface MessageAttachment {
  id: string
  name: string
  size?: number
  mimeType?: string
}

function formatSize(bytes: number | undefined): string {
  if (!bytes || bytes < 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function MessageAttachments({ metadata }: { metadata: Record<string, unknown> }) {
  const raw = metadata?.attachments
  if (!Array.isArray(raw) || !raw.length) return null
  const files = raw as MessageAttachment[]
  return (
    <div className={cn('flex flex-wrap gap-1.5', 'mb-1.5')}>
      {files.map((file) => (
        <button
          key={file.id}
          type="button"
          onClick={() => void api.downloadChatFile(file)}
          className="group inline-flex max-w-full items-center gap-1.5 rounded-lg border border-accent/25 bg-panel/70 py-1 pl-2 pr-1.5 text-[10.5px] text-muted transition-colors hover:border-accent/50 hover:text-ink"
          title={`Download ${file.name}`}
        >
          <FileText className="h-3 w-3 shrink-0 text-accent" />
          <span className="max-w-[180px] truncate font-medium">{file.name}</span>
          {file.size ? <span className="shrink-0 text-[9px] text-faint">{formatSize(file.size)}</span> : null}
          <Download className="h-2.5 w-2.5 shrink-0 text-faint group-hover:text-accent" />
        </button>
      ))}
    </div>
  )
}

export function MessageList() {
  const chat = useAppStore((state) => state.detail?.chat || null)
  const allMessages = useAppStore((state) => state.detail?.messages)
  const queue = useAppStore((state) => state.detail?.queue) || []
  const files = useAppStore((state) => state.detail?.files) || []
  const removeQueuedMessage = useAppStore((state) => state.removeQueuedMessage)
  const agents = useAppStore((state) => state.agents)
  const runTasks = useAppStore((state) => state.detail?.tasks) || []
  const providerCount = useAppStore((state) => state.providers.length)
  const toggleInspector = useAppStore((state) => state.toggleInspector)
  const setDraft = useAppStore((state) => state.setDraft)
  const activeRuns = useAppStore((state) => state.activeRuns)
  const openModal = useAppStore((state) => state.openModal)

  const scrollRef = useRef<HTMLDivElement>(null)
  const [atBottom, setAtBottom] = useState(true)

  const agent = agents.find((entry) => entry.id === chat?.agentId)
  const messages = (allMessages || []).filter(
    (message) =>
      message.role === 'user' || message.role === 'assistant' || message.role === 'agent',
  )
  const running = Boolean(chat && activeRuns.some((run) => run.chatId === chat.id && run.status === 'running'))
  const lastContentLength = messages[messages.length - 1]?.content.length || 0
  const lastReasoningLength = messages[messages.length - 1]?.reasoning.length || 0

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    if (atBottom) {
      element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' })
    }
  }, [messages.length, lastContentLength, lastReasoningLength, atBottom])

  useEffect(() => {
    setAtBottom(true)
    const element = scrollRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [chat?.id])

  const onScroll = () => {
    const element = scrollRef.current
    if (!element) return
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight
    setAtBottom(distance < 90)
  }

  const openInspector = () => {
    if (!useAppStore.getState().inspectorOpen) toggleInspector()
  }

  if (!chat) return null

  const suggestions = [
    'Plan a feature end-to-end and split the work across specialist agents.',
    'Research three approaches, compare them, and recommend one with trade-offs.',
    'Review this project for risks, missing tests, and the highest-leverage fixes.',
  ]

  if (messages.length === 0) {
    return (
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col items-center justify-center px-6 py-12 text-center">
          <Avatar name={agent?.name || 'Agent'} color={agent?.color} size="lg" className="h-14 w-14 text-lg" />
          <h2 className="mt-4 text-[20px] font-semibold tracking-[-0.02em] text-ink">
            {chat.kind === 'agent' ? chat.title : `Start with ${agent?.name || 'your agent'}`}
          </h2>
          <p className="mt-1.5 max-w-md text-[12.5px] leading-relaxed text-muted">
            {chat.kind === 'agent'
              ? 'This sub-agent received a self-contained brief. You can add context or ask a follow-up below.'
              : agent?.description || 'Describe the outcome you want. The agent can delegate work in parallel.'}
          </p>

          {chat.kind === 'agent' && messages.length ? null : (
            <div className="mt-6 flex w-full max-w-lg flex-col gap-1.5">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => {
                    setDraft(chat.id, suggestion)
                    setTimeout(() => {
                      document.querySelector<HTMLTextAreaElement>('textarea')?.focus()
                    }, 30)
                  }}
                  className="group flex items-center gap-2 rounded-xl border border-line bg-panel px-3.5 py-2.5 text-left text-[12px] text-muted transition-colors hover:border-accent/30 hover:text-ink"
                >
                  <Layers className="h-3.5 w-3.5 shrink-0 text-faint group-hover:text-accent" />
                  <span className="flex-1">{suggestion}</span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              ))}
            </div>
          )}

          {!providerCount ? (
            <div className="mt-6 rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-[12px] text-warn">
              No harness connected yet.{' '}
              <button
                type="button"
                className="font-semibold underline"
                onClick={() => openModal({ type: 'settings', tab: 'providers' })}
              >
                Connect one
              </button>{' '}
              to start.
            </div>
          ) : null}

          {agent?.canSpawn ? (
            <p className="mt-6 max-w-sm text-[10.5px] leading-relaxed text-faint">
              {agent.name} can spawn parallel sub-agents, each with its own model. Use the model
              selector in the header to choose the orchestrator model.
            </p>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="scroll-thin h-full overflow-y-auto"
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pb-10 pt-6 sm:px-6">
          {messages.map((message) =>
            message.role === 'user' ? (
              <div key={message.id} className="fade-up flex justify-end">
                <div className="max-w-[86%] rounded-2xl rounded-br-md border border-accent/20 bg-accent-soft px-4 py-2.5 text-[13.5px] leading-relaxed text-ink">
                  <MessageAttachments metadata={message.metadata} />
                  <div className="whitespace-pre-wrap">{message.content}</div>
                </div>
              </div>
            ) : message.role === 'agent' ? (
              <AgentReport key={message.id} message={message} />
            ) : (
              <AssistantMessage
                key={message.id}
                message={message}
                agent={agent}
                tasks={runTasks}
                onOpenInspector={openInspector}
              />
            ),
          )}
          {queue.map((item) => {
            const names = item.fileIds
              .map((fileId) => files.find((file) => file.id === fileId)?.name)
              .filter(Boolean)
            return (
              <div key={item.id} className="fade-up flex justify-end">
                <div className="max-w-[86%] rounded-2xl rounded-br-md border border-dashed border-accent/30 bg-panel2/60 px-4 py-2.5 text-[13px] leading-relaxed text-muted">
                  <div className="mb-1 flex items-center gap-1.5">
                    <Clock className="h-3 w-3 text-accent" />
                    <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-accent">
                      queued
                    </span>
                    <span className="flex-1" />
                    <button
                      type="button"
                      onClick={() => void removeQueuedMessage(item.id)}
                      className="inline-flex h-4 w-4 items-center justify-center rounded text-faint hover:bg-panel hover:text-danger"
                      aria-label="Remove queued message"
                      title="Remove from queue"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                  <div className="whitespace-pre-wrap">{item.content}</div>
                  {names.length ? (
                    <div className="mt-1 truncate text-[10px] text-faint">
                      {names.join(' · ')}
                    </div>
                  ) : null}
                </div>
              </div>
            )
          })}
          {running && messages[messages.length - 1]?.role === 'user' ? (
            <div className="flex gap-3">
              <Avatar name={agent?.name || 'Agent'} color={agent?.color} size="md" />
              <div className="pt-2">
                <TypingDots />
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {!atBottom ? (
        <button
          type="button"
          onClick={() => {
            scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
            setAtBottom(true)
          }}
          className="absolute bottom-4 left-1/2 inline-flex h-8 -translate-x-1/2 items-center gap-1.5 rounded-full border border-line bg-panel px-3 text-[11px] font-medium text-muted shadow-lg transition-colors hover:text-ink"
        >
          <ArrowDown className="h-3.5 w-3.5" /> Jump to latest
        </button>
      ) : null}
    </div>
  )
}
