import { ArrowUp, FileText, Paperclip, Sparkles, Square, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { useAppStore } from '../store'
import type { ChatFile } from '../types'
import { cn, Kbd, Spinner } from './ui'

const MAX_FILES = 8
const MAX_FILE_BYTES = 25 * 1024 * 1024

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function Composer() {
  const chat = useAppStore((state) => state.detail?.chat || null)
  const activeRuns = useAppStore((state) => state.activeRuns)
  const drafts = useAppStore((state) => state.drafts)
  const sending = useAppStore((state) => state.sending)
  const agents = useAppStore((state) => state.agents)
  const send = useAppStore((state) => state.send)
  const stop = useAppStore((state) => state.stop)
  const setDraft = useAppStore((state) => state.setDraft)

  const chatId = chat?.id || ''
  const draft = drafts[chatId] || ''
  const detailFiles = useAppStore((state) => state.detail?.files)
  const [focused, setFocused] = useState(false)
  const [pending, setPending] = useState<ChatFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const hydratedChatRef = useRef('')

  const running = Boolean(chat && activeRuns.some((run) => run.chatId === chat.id && run.status === 'running'))
  const agent = agents.find((entry) => entry.id === chat?.agentId)
  const canSend = Boolean((draft.trim() || pending.length) && !sending && !uploading)
  const queued = useAppStore((state) => state.detail?.queue?.length || 0)
  const activityByChat = useAppStore((state) => state.activityByChat)
  const tasks = useAppStore((state) => state.detail?.tasks) || []
  const activeTask = tasks.find((task) => task.status === 'running' || task.status === 'queued')
  const taskAgent = activeTask ? agents.find((entry) => entry.id === activeTask.agentId)?.name : ''
  const activity = activityByChat[chatId] || ''
  const genericActivity = !activity || ['Thinking…', 'Writing…', 'Synthesizing…'].includes(activity)
  const workLabel = !genericActivity
    ? `${activity}${activeTask ? ` · ${activeTask.title}` : ''}`
    : activeTask
      ? `${taskAgent || 'Agent'} · ${activeTask.title}`
      : activity || 'Working…'

  useEffect(() => {
    const element = ref.current
    if (!element) return
    element.style.height = '0px'
    element.style.height = `${Math.min(element.scrollHeight, 200)}px`
  }, [draft, chatId])

  useEffect(() => {
    setFocused(false)
  }, [chatId])

  useEffect(() => {
    if (!chatId) {
      hydratedChatRef.current = ''
      setPending([])
      return
    }
    if (hydratedChatRef.current === chatId || !detailFiles) return
    if (useAppStore.getState().detail?.chat.id !== chatId) return
    hydratedChatRef.current = chatId
    // Recover files uploaded for this chat but not yet attached to a message.
    setPending(detailFiles.filter((file) => !file.messageId))
  }, [chatId, detailFiles])

  const uploadFiles = async (list: File[]) => {
    if (!chatId || !list.length || uploading) return
    const room = MAX_FILES - pending.length
    if (room <= 0) {
      useAppStore.getState().toast('info', `You can attach up to ${MAX_FILES} files per message.`)
      return
    }
    const chosen = list.slice(0, room)
    const tooBig = chosen.find((file) => file.size > MAX_FILE_BYTES)
    if (tooBig) {
      useAppStore.getState().toast('error', `"${tooBig.name}" is larger than 25 MB.`)
      return
    }
    setUploading(true)
    try {
      for (const file of chosen) {
        try {
          const created = await api.uploadChatFile(chatId, file)
          setPending((current) => [...current, created])
        } catch (err) {
          useAppStore
            .getState()
            .toast('error', err instanceof Error ? err.message : `Could not upload ${file.name}.`)
        }
      }
    } finally {
      setUploading(false)
    }
  }

  const removePending = async (file: ChatFile) => {
    setPending((current) => current.filter((entry) => entry.id !== file.id))
    try {
      await api.deleteChatFile(file.id)
    } catch {
      // best effort cleanup of the workspace file
    }
  }

  const submit = async () => {
    const text = draft.trim()
    if (!chatId || sending || uploading) return
    if (!text && !pending.length) return
    const content = text || 'See the attached files.'
    const fileIds = pending.map((file) => file.id)
    const ok = await send(content, fileIds)
    if (ok) {
      setPending([])
      setTimeout(() => ref.current?.focus(), 30)
    }
  }

  if (!chat) return null

  return (
    <div className="shrink-0 bg-gradient-to-t from-bg via-bg to-transparent px-4 pb-4 pt-2 sm:px-6 sm:pb-5">
      <div className="mx-auto w-full max-w-3xl">
        {running ? (
          <div className="mb-2 flex items-center gap-2 px-1 text-[11px] text-muted">
            <Spinner className="h-3 w-3 shrink-0 text-ink" />
            <span className="min-w-0 flex-1 truncate animate-pulse">{workLabel}</span>
            {queued ? (
              <span className="shrink-0 rounded-full border border-line px-1.5 py-px text-[9.5px] text-faint">
                {queued} queued
              </span>
            ) : null}
          </div>
        ) : null}
        <div
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes('Files')) {
              event.preventDefault()
              setDragOver(true)
            }
          }}
          onDragLeave={(event) => {
            if (event.currentTarget === event.target) setDragOver(false)
          }}
          onDrop={(event) => {
            event.preventDefault()
            setDragOver(false)
            void uploadFiles(Array.from(event.dataTransfer.files))
          }}
          className={cn(
            'rounded-2xl border bg-panel shadow-[0_2px_20px_-10px_rgba(0,0,0,0.25)] transition-[border-color,box-shadow]',
            dragOver
              ? 'border-accent shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_14%,transparent)]'
              : focused
                ? 'border-accent/50 shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_10%,transparent)]'
                : 'border-line',
          )}
        >
          {pending.length || uploading ? (
            <div className="flex flex-wrap gap-1.5 px-3 pt-2.5">
              {pending.map((file) => (
                <span
                  key={file.id}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-line bg-panel2 py-1 pl-2 pr-1 text-[10.5px] text-muted"
                >
                  <FileText className="h-3 w-3 shrink-0 text-accent" />
                  <span className="max-w-[160px] truncate font-medium text-ink">{file.name}</span>
                  <span className="shrink-0 text-[9px] text-faint">{fileSize(file.size)}</span>
                  <button
                    type="button"
                    onClick={() => void removePending(file)}
                    className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-faint hover:bg-panel hover:text-danger"
                    aria-label={`Remove ${file.name}`}
                    title={`Remove ${file.name}`}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
              {uploading ? (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-line px-2 py-1 text-[10px] text-faint">
                  <Spinner className="h-2.5 w-2.5 text-accent" />
                  uploading…
                </span>
              ) : null}
            </div>
          ) : null}

          <textarea
            ref={ref}
            value={draft}
            onChange={(event) => setDraft(chatId, event.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onPaste={(event) => {
              const files = Array.from(event.clipboardData.files || [])
              if (files.length) {
                event.preventDefault()
                void uploadFiles(files)
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                void submit()
              }
            }}
            rows={1}
            placeholder={
              running
                ? 'Agents are working. Type your next message — it will be queued and sent when this run finishes…'
                : chat.kind === 'agent'
                  ? 'Reply to this sub-agent or give it more context…'
                  : agent?.name === 'Orchestrator'
                    ? 'Describe a goal. The orchestrator will split it across agents…'
                    : `Message ${agent?.name || 'the agent'}…`
            }
            className="scroll-thin block max-h-[200px] min-h-[54px] w-full resize-none bg-transparent px-4 pb-1 pt-3.5 text-[13.5px] leading-relaxed text-ink placeholder:text-faint focus:outline-none"
          />
          <div className="flex items-center gap-2 px-2.5 pb-2.5 pt-1">
            <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(event) => {
                  void uploadFiles(Array.from(event.target.files || []))
                  event.target.value = ''
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-panel2 hover:text-ink disabled:opacity-40"
                aria-label="Attach files"
                title={`Attach files to this chat · stored in the project workspace (max ${MAX_FILES})`}
              >
                {uploading ? <Spinner className="h-3.5 w-3.5 text-accent" /> : <Paperclip className="h-3.5 w-3.5" />}
              </button>
              <span className="inline-flex items-center gap-1 rounded-md bg-panel2 px-1.5 py-0.5 text-[10px] font-medium text-muted">
                <Sparkles className="h-2.5 w-2.5 text-accent" />
                {agent?.name || 'Agent'}
              </span>
              {agent?.canSpawn ? (
                <span className="hidden text-[10px] text-faint sm:inline">can delegate</span>
              ) : null}
              <span className="hidden truncate text-[10px] text-faint md:inline">
                {chat.model || 'harness default'}
              </span>
            </div>

            <span className="hidden items-center gap-1 text-[10px] text-faint sm:flex">
              <Kbd>↵</Kbd> send
              <span className="px-0.5">·</span>
              <Kbd>⇧↵</Kbd> newline
            </span>

            {running ? (
              <button
                type="button"
                onClick={() => void stop()}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-danger/30 bg-danger/10 px-2.5 text-[11.5px] font-medium text-danger transition-colors hover:bg-danger/15"
                title="Stop the current run and clear queued messages"
              >
                <Square className="h-3 w-3 fill-current" />
                Stop
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!canSend}
              className={cn(
                'inline-flex h-8 w-8 items-center justify-center rounded-lg transition-all',
                canSend ? 'bg-accent text-accent-ink hover:brightness-110' : 'bg-panel2 text-faint',
              )}
              aria-label={running ? 'Queue message' : 'Send message'}
              title={running ? 'Queue this message' : 'Send message'}
            >
              {sending ? <Spinner /> : <ArrowUp className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="mt-1.5 flex items-center justify-between px-1">
          <span className="text-[10px] text-faint">
            {running ? (
              <span>
                {queued
                  ? `${queued} queued — sends when this run finishes`
                  : 'Enter queues your next message'}
              </span>
            ) : dragOver ? (
              <span className="text-ink">Drop files to attach them to this message</span>
            ) : (
              <span>Attach files or drop them here — agents can read the text inside.</span>
            )}
          </span>
        </div>
      </div>
    </div>
  )
}
