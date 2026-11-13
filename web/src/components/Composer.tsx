import { ArrowUp, Command, Sparkles, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store'
import { cn, Kbd, Spinner } from './ui'

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
  const [focused, setFocused] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)

  const running = Boolean(chat && activeRuns.some((run) => run.chatId === chat.id && run.status === 'running'))
  const agent = agents.find((entry) => entry.id === chat?.agentId)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    element.style.height = '0px'
    element.style.height = `${Math.min(element.scrollHeight, 200)}px`
  }, [draft, chatId])

  useEffect(() => {
    setFocused(false)
  }, [chatId])

  const submit = async () => {
    const text = draft.trim()
    if (!text || running || sending || !chatId) return
    const ok = await send(text)
    if (ok) {
      setTimeout(() => ref.current?.focus(), 30)
    }
  }

  if (!chat) return null

  return (
    <div className="shrink-0 bg-gradient-to-t from-bg via-bg to-transparent px-4 pb-4 pt-2 sm:px-6 sm:pb-5">
      <div className="mx-auto w-full max-w-3xl">
        <div
          className={cn(
            'rounded-2xl border bg-panel shadow-[0_2px_20px_-10px_rgba(0,0,0,0.25)] transition-[border-color,box-shadow]',
            focused ? 'border-accent/50 shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_10%,transparent)]' : 'border-line',
          )}
        >
          <textarea
            ref={ref}
            value={draft}
            onChange={(event) => setDraft(chatId, event.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                void submit()
              }
            }}
            rows={1}
            placeholder={
              running
                ? 'Agents are working. You can queue your next message after this run finishes…'
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
                title="Stop the current run"
              >
                <Square className="h-3 w-3 fill-current" />
                Stop
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void submit()}
                disabled={!draft.trim() || sending}
                className={cn(
                  'inline-flex h-8 w-8 items-center justify-center rounded-lg transition-all',
                  draft.trim() && !sending
                    ? 'bg-accent text-accent-ink hover:brightness-110'
                    : 'bg-panel2 text-faint',
                )}
                aria-label="Send message"
              >
                {sending ? <Spinner /> : <ArrowUp className="h-4 w-4" />}
              </button>
            )}
          </div>
        </div>

        <div className="mt-1.5 flex items-center justify-between px-1">
          <span className="text-[10px] text-faint">
            {running ? (
              <span className="inline-flex items-center gap-1.5 text-accent">
                <span className="h-1.5 w-1.5 rounded-full bg-accent pulse-soft" />
                Orchestration live — watch the panel for agent activity
              </span>
            ) : (
              <span>Agents run in parallel. You stay in control of every model.</span>
            )}
          </span>
          <span className="hidden items-center gap-1 text-[10px] text-faint sm:flex">
            <Command className="h-2.5 w-2.5" /> multi-agent workspace
          </span>
        </div>
      </div>
    </div>
  )
}
