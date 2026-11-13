import type { BusEvent } from './types.js'

type Listener = (event: BusEvent) => void

class EventBus {
  private listeners = new Set<Listener>()

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  emit(type: string, payload: Record<string, unknown> = {}): void {
    const event: BusEvent = { type, at: Date.now(), ...payload }
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch {
        // a broken SSE client must never break orchestration
      }
    }
  }

  get size(): number {
    return this.listeners.size
  }
}

export const bus = new EventBus()
