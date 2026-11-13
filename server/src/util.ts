import { randomBytes } from 'node:crypto'

export const now = () => Date.now()

export function id(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString('hex')}`
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || !value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return typeof err === 'string' ? err : 'Unknown error'
}

export function truncate(text: string, length: number): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > length ? `${clean.slice(0, length - 1)}…` : clean
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Aborted'))
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new Error('Aborted'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}
