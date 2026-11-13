import { clsx } from 'clsx'
import { Loader2, X } from 'lucide-react'
import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { createPortal } from 'react-dom'

export function cn(...values: Array<string | false | null | undefined>): string {
  return clsx(values)
}

/* ---------------------------------- button ---------------------------------- */

type Variant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger'
type Size = 'sm' | 'md' | 'lg' | 'icon'

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-accent text-accent-ink hover:brightness-110 shadow-[0_1px_2px_rgba(0,0,0,0.12)] border border-transparent',
  secondary: 'bg-panel2 text-ink border border-line hover:border-line-strong',
  ghost: 'text-muted hover:text-ink hover:bg-panel2 border border-transparent',
  outline: 'border border-line text-ink hover:bg-panel2 hover:border-line-strong',
  danger: 'bg-danger/10 text-danger border border-danger/25 hover:bg-danger/15',
}

const sizeClasses: Record<Size, string> = {
  sm: 'h-7.5 px-2.5 text-[12px] gap-1.5 rounded-md',
  md: 'h-9 px-3.5 text-[13px] gap-2 rounded-lg',
  lg: 'h-10 px-4 text-sm gap-2 rounded-lg',
  icon: 'h-8 w-8 rounded-lg',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'secondary', size = 'md', loading, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex select-none items-center justify-center font-medium transition-[background-color,border-color,color,filter,box-shadow] duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-0',
        'disabled:pointer-events-none disabled:opacity-45',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="spin h-3.5 w-3.5" /> : null}
      {children}
    </button>
  )
})

/* ---------------------------------- inputs ---------------------------------- */

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        'h-9 w-full rounded-lg border border-line bg-panel px-3 text-[13px] text-ink placeholder:text-faint',
        'transition-colors focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/15',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          'w-full rounded-lg border border-line bg-panel px-3 py-2 text-[13px] leading-relaxed text-ink placeholder:text-faint',
          'transition-colors focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/15',
          'scroll-thin',
          className,
        )}
        {...props}
      />
    )
  },
)

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          'h-9 w-full cursor-pointer appearance-none rounded-lg border border-line bg-panel px-3 pr-8 text-[13px] text-ink',
          'bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%239a9aa8\' stroke-width=\'2\'%3E%3Cpath d=\'m6 9 6 6 6-6\'/%3E%3C/svg%3E")] bg-[length:12px] bg-[position:right_10px_center] bg-no-repeat',
          'focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/15',
          className,
        )}
        {...props}
      >
        {children}
      </select>
    )
  },
)

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: ReactNode
  hint?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label className="text-[11.5px] font-medium tracking-[0.01em] text-muted">{label}</label>
      {children}
      {hint ? <div className="text-[11px] leading-relaxed text-faint">{hint}</div> : null}
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
  label?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full border transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
        checked ? 'border-accent/40 bg-accent' : 'border-line-strong bg-panel2',
        disabled && 'opacity-50',
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
          checked ? 'translate-x-[18px]' : 'translate-x-[3px]',
        )}
      />
    </button>
  )
}

/* ---------------------------------- badges ---------------------------------- */

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: 'neutral' | 'accent' | 'success' | 'warn' | 'danger'
  className?: string
}) {
  const tones = {
    neutral: 'border-line bg-panel2 text-muted',
    accent: 'border-accent/25 bg-accent/10 text-accent',
    success: 'border-success/25 bg-success/10 text-success',
    warn: 'border-warn/25 bg-warn/10 text-warn',
    danger: 'border-danger/25 bg-danger/10 text-danger',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10.5px] font-medium leading-none',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('spin h-3.5 w-3.5', className)} />
}

export function Avatar({
  name,
  color,
  size = 'md',
  className,
}: {
  name: string
  color?: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
}) {
  const sizes = {
    xs: 'h-5 w-5 text-[9px] rounded-md',
    sm: 'h-6.5 w-6.5 text-[10px] rounded-lg',
    md: 'h-8 w-8 text-[11px] rounded-lg',
    lg: 'h-10 w-10 text-[13px] rounded-xl',
  }
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center border font-semibold',
        sizes[size],
        className,
      )}
      style={{
        backgroundColor: color ? `${color}1f` : 'var(--panel2)',
        borderColor: color ? `${color}3d` : 'var(--line)',
        color: color || 'var(--muted)',
      }}
      title={name}
    >
      {initials || '?'}
    </span>
  )
}

/* ---------------------------------- modal ----------------------------------- */

const ModalContext = createContext<() => void>(() => {})

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
  bodyClassName,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  bodyClassName?: string
}) {
  useEffect(() => {
    if (!open) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const widths = {
    sm: 'max-w-md',
    md: 'max-w-xl',
    lg: 'max-w-3xl',
    xl: 'max-w-5xl',
  }

  return createPortal(
    <ModalContext.Provider value={onClose}>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
        <div
          className="absolute inset-0 bg-black/45 backdrop-blur-[2px] fade-in dark:bg-black/65"
          onClick={onClose}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label={typeof title === 'string' ? title : 'Dialog'}
          className={cn(
            'fade-up relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_24px_80px_-20px_rgba(0,0,0,0.45)]',
            widths[size],
          )}
        >
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
              {subtitle ? <p className="mt-0.5 text-[12px] text-muted">{subtitle}</p> : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="-mr-1 -mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-panel2 hover:text-ink"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className={cn('scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-4', bodyClassName)}>
            {children}
          </div>
          {footer ? (
            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-panel px-5 py-3">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </ModalContext.Provider>,
    document.body,
  )
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  onConfirm,
  onClose,
  loading,
}: {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel?: string
  onConfirm: () => void
  onClose: () => void
  loading?: boolean
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" size="md" onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-[13px] leading-relaxed text-muted">{message}</p>
    </Modal>
  )
}

/* --------------------------------- popover ---------------------------------- */

export function Popover({
  trigger,
  children,
  align = 'start',
  width = 'w-56',
  panelClassName,
}: {
  trigger: (open: boolean) => ReactNode
  children: (close: () => void) => ReactNode
  align?: 'start' | 'end'
  width?: string
  panelClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="relative inline-flex" ref={ref}>
      <div className="inline-flex" onClick={() => setOpen((value) => !value)}>
        {trigger(open)}
      </div>
      {open ? (
        <div
          className={cn(
            'fade-in absolute z-50 mt-1.5 overflow-hidden rounded-xl border border-line bg-panel p-1 shadow-[0_16px_48px_-12px_rgba(0,0,0,0.35)]',
            align === 'end' ? 'right-0' : 'left-0',
            width,
            panelClassName,
          )}
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  )
}

export function MenuItem({
  icon,
  children,
  onClick,
  danger,
  disabled,
  hint,
}: {
  icon?: ReactNode
  children: ReactNode
  onClick?: () => void
  danger?: boolean
  disabled?: boolean
  hint?: ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] transition-colors',
        danger ? 'text-danger hover:bg-danger/10' : 'text-ink hover:bg-panel2',
        disabled && 'pointer-events-none opacity-40',
      )}
    >
      {icon ? <span className="shrink-0 text-muted">{icon}</span> : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint ? <span className="shrink-0 text-[10.5px] text-faint">{hint}</span> : null}
    </button>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-line bg-panel px-1.5 py-0.5 font-sans text-[10px] font-medium text-faint">
      {children}
    </kbd>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: ReactNode
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-10 text-center', className)}>
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-panel2 text-muted">
        {icon}
      </div>
      <div className="text-[13px] font-medium text-ink">{title}</div>
      {description ? <div className="mt-1 max-w-xs text-[12px] leading-relaxed text-muted">{description}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

export function useModalClose(): () => void {
  return useContext(ModalContext)
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-2 pb-1 pt-3 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-faint">
      {children}
    </div>
  )
}
