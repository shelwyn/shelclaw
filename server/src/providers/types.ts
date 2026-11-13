import type { Provider, ToolCall, Usage } from '../types.js'

export interface ChatTurn {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  toolCalls?: ToolCall[]
  toolCallId?: string
  name?: string
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface StreamRequest {
  provider: Provider
  model: string
  messages: ChatTurn[]
  tools: ToolDefinition[]
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
}

export type StreamPart =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'tool_call'; id: string; name: string; arguments: string }
  | { type: 'usage'; usage: Usage }
  | { type: 'done' }

export interface ProviderAdapter {
  stream(req: StreamRequest): AsyncGenerator<StreamPart>
  listModels(provider: Provider): Promise<string[]>
  test(provider: Provider): Promise<string>
}
