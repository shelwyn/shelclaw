export class AppError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.name = 'AppError'
    this.status = status
  }
}

export function isAbortError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return /abort/i.test(message) || (err instanceof Error && err.name === 'AbortError')
}
