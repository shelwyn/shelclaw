import type { StreamPart } from './types.js'

export interface PromptToolCall {
  name: string
  arguments: string
}

const START = '<opencodex_tool>'
const END = '</opencodex_tool>'
const FENCE = /```(?:opencodex-tool|json)?\s*([\s\S]*?)```/gi

export function parseToolPayload(raw: string): PromptToolCall | null {
  let text = raw.trim()
  if (!text) return null
  const fenced = /^```(?:opencodex-tool|json)?\s*([\s\S]*?)\s*```$/i.exec(text)
  if (fenced) text = fenced[1].trim()
  try {
    const value = JSON.parse(text)
    if (!value || typeof value !== 'object') return null
    const name = typeof value.name === 'string' ? value.name : value.tool
    if (typeof name === 'string' && value.arguments != null) {
      return {
        name,
        arguments:
          typeof value.arguments === 'string'
            ? value.arguments
            : JSON.stringify(value.arguments),
      }
    }
    if (Array.isArray(value.tasks)) {
      return { name: 'spawn_agents', arguments: JSON.stringify({ tasks: value.tasks }) }
    }
    return null
  } catch {
    return null
  }
}

/** Parse protocol blocks out of a completed message (tags or fenced JSON). */
export function extractPromptToolText(input: string): { text: string; calls: PromptToolCall[] } {
  const calls: PromptToolCall[] = []
  let text = ''
  let cursor = 0

  const tag = new RegExp(`${START}([\\s\\S]*?)${END}`, 'gi')
  let match: RegExpExecArray | null
  while ((match = tag.exec(input))) {
    text += input.slice(cursor, match.index)
    const parsed = parseToolPayload(match[1])
    if (parsed) calls.push(parsed)
    else text += match[0]
    cursor = match.index + match[0].length
  }
  text += input.slice(cursor)

  if (!calls.length) {
    // Also accept a fenced ```opencodex-tool block for harnesses that prefer fences.
    while ((match = FENCE.exec(text))) {
      const parsed = parseToolPayload(match[0])
      if (!parsed) continue
      calls.push(parsed)
      text = text.slice(0, match.index) + text.slice(match.index + match[0].length)
      FENCE.lastIndex = 0
    }
  }

  return { text: text.trim(), calls }
}

function partialMarkerLength(text: string): number {
  for (let length = Math.min(START.length - 1, text.length); length > 0; length--) {
    if (text.endsWith(START.slice(0, length))) return length
  }
  return 0
}

/**
 * Streaming filter that hides <opencodex_tool> blocks from the UI and turns
 * them into tool calls after the block closes. This lets harnesses without
 * native function calling use OpenCodex delegation.
 */
export class PromptToolFilter {
  private buffer = ''
  private inBlock = false
  private calls: PromptToolCall[] = []

  push(chunk: string): string {
    this.buffer += chunk
    let output = ''

    while (true) {
      if (!this.inBlock) {
        const index = this.buffer.indexOf(START)
        if (index === -1) {
          const hold = partialMarkerLength(this.buffer)
          const emit = this.buffer.slice(0, this.buffer.length - hold)
          output += emit
          this.buffer = this.buffer.slice(this.buffer.length - hold)
          break
        }
        output += this.buffer.slice(0, index)
        this.buffer = this.buffer.slice(index + START.length)
        this.inBlock = true
        continue
      }

      const end = this.buffer.indexOf(END)
      if (end === -1) break
      const block = this.buffer.slice(0, end)
      this.buffer = this.buffer.slice(end + END.length)
      this.inBlock = false
      const parsed = parseToolPayload(block)
      if (parsed) this.calls.push(parsed)
      else output += `${START}${block}${END}`
    }

    return output
  }

  finish(): { text: string; calls: PromptToolCall[] } {
    let text = this.buffer
    if (this.inBlock) text = `${START}${text}`
    this.buffer = ''
    this.inBlock = false
    const calls = this.calls
    this.calls = []
    return { text, calls }
  }
}

let callCounter = 0

/** Wrap a provider stream and translate the prompt delegation protocol. */
export async function* applyPromptToolFilter(
  source: AsyncIterable<StreamPart>,
): AsyncGenerator<StreamPart> {
  const filter = new PromptToolFilter()
  const flush = function* (): Generator<StreamPart> {
    const result = filter.finish()
    if (result.text) yield { type: 'text', text: result.text }
    for (const call of result.calls) {
      yield {
        type: 'tool_call',
        id: `call_harness_${Date.now().toString(36)}_${callCounter++}`,
        name: call.name,
        arguments: call.arguments,
      }
    }
  }

  let done = false
  for await (const part of source) {
    if (part.type === 'text') {
      const text = filter.push(part.text)
      if (text) yield { type: 'text', text }
      continue
    }
    if (part.type === 'done') {
      yield* flush()
      done = true
    }
    yield part
  }
  if (!done) yield* flush()
}
