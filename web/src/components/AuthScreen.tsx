import { ArrowRight, KeyRound, Lock, ShieldCheck, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useAppStore } from '../store'
import { Button, Input } from './ui'

export function AuthScreen() {
  const submitToken = useAppStore((state) => state.submitToken)
  const authError = useAppStore((state) => state.authError)
  const [token, setToken] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!token.trim()) {
      setError('Enter the access token configured on the server.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await submitToken(token.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not connect.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-bg px-4">
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-70" />
      <div className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-accent/10 blur-[110px]" />

      <div className="relative w-full max-w-[400px]">
        <div className="mb-6 flex items-center justify-center gap-3">
          <div className="logo-mark flex h-10 w-10 items-center justify-center rounded-xl text-white">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 3 4.5 7.2v9.6L12 21l7.5-4.2V7.2L12 3Z" strokeLinejoin="round" />
              <path d="m4.8 7.4 7.2 4.1 7.2-4.1M12 11.5V21" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <div className="text-[17px] font-semibold tracking-[-0.02em] text-ink">OpenCodex</div>
            <div className="text-[10.5px] text-faint">multi-agent workspace</div>
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-panel p-5 shadow-[0_24px_80px_-30px_rgba(0,0,0,0.35)]">
          <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg border border-accent/25 bg-accent/10 text-accent">
            <Lock className="h-4 w-4" />
          </div>
          <h1 className="text-[16px] font-semibold tracking-[-0.01em] text-ink">Access token required</h1>
          <p className="mt-1 text-[12px] leading-relaxed text-muted">
            This server is protected. Enter the <span className="font-mono text-[11px]">APP_TOKEN</span>{' '}
            configured in its environment.
          </p>

          <div className="mt-4 space-y-2">
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
              <Input
                autoFocus
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void submit()
                }}
                placeholder="Access token"
                className="pl-8"
              />
            </div>
            {error || authError ? (
              <p className="rounded-md border border-danger/25 bg-danger/5 px-2 py-1.5 text-[11px] leading-relaxed text-danger">
                {error || authError}
              </p>
            ) : null}
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              onClick={() => void submit()}
              loading={submitting}
            >
              Unlock workspace <ArrowRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="mt-4 flex items-start gap-2 border-t border-line pt-3 text-[10px] leading-relaxed text-faint">
            <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              Tokens are stored in this browser only. Provider keys never leave your server.
            </span>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-center gap-1.5 text-[10px] text-faint">
          <Sparkles className="h-3 w-3" />
          Parallel agents · per-agent models · recursive delegation
        </div>
      </div>
    </div>
  )
}
