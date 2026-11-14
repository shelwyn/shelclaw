import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { useAppStore } from '../store'
import { cn } from './ui'

export function Toasts() {
  const toasts = useAppStore((state) => state.toasts)
  const dismiss = useAppStore((state) => state.dismissToast)

  if (!toasts.length) return null

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-[340px] max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((toast) => {
        const Icon =
          toast.level === 'success' ? CheckCircle2 : toast.level === 'error' ? AlertCircle : Info
        return (
          <div
            key={toast.id}
            className={cn(
              'fade-up pointer-events-auto flex items-start gap-2.5 rounded-xl border bg-panel px-3 py-2.5 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.35)]',
              toast.level === 'error'
                ? 'border-danger/30'
                : toast.level === 'success'
                  ? 'border-success/30'
                  : 'border-line',
            )}
          >
            <Icon
              className={cn(
                'mt-0.5 h-4 w-4 shrink-0',
                toast.level === 'error'
                  ? 'text-danger'
                  : toast.level === 'success'
                    ? 'text-ink'
                    : 'text-accent',
              )}
            />
            <div className="min-w-0 flex-1 text-[11.5px] leading-relaxed text-ink">{toast.message}</div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-faint hover:bg-panel2 hover:text-ink"
              aria-label="Dismiss"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
