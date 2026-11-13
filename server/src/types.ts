export type ProviderKind =
  | 'openai'
  | 'azure'
  | 'anthropic'
  | 'ollama'
  | 'custom'
  | 'opencode'
  | 'opencode-server'
  | 'claude-code'
  | 'local-harness'

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool' | 'agent'
export type RunStatus = 'running' | 'done' | 'error' | 'cancelled'
export type TaskStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled'
export type ChatKind = 'root' | 'agent' | 'direct'
export type ChatStatus = 'idle' | 'running' | 'error'

export interface ToolCall {
  id: string
  name: string
  arguments: string
}

export interface Provider {
  id: string
  name: string
  kind: ProviderKind
  baseUrl: string
  apiKey: string
  apiVersion: string
  defaultModel: string
  models: string[]
  config: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

export type SafeProvider = Omit<Provider, 'apiKey'> & { hasKey: boolean }

export interface Project {
  id: string
  name: string
  description: string
  systemPrompt: string
  workspacePath: string
  color: string
  createdAt: number
  updatedAt: number
}

export interface Agent {
  id: string
  projectId: string
  name: string
  description: string
  systemPrompt: string
  color: string
  providerId: string
  model: string
  maxDepth: number
  maxSteps: number
  canSpawn: boolean
  builtin: boolean
  isOrchestrator: boolean
  createdAt: number
  updatedAt: number
}

export interface Chat {
  id: string
  projectId: string
  parentChatId: string
  rootChatId: string
  agentId: string
  title: string
  providerId: string
  model: string
  kind: ChatKind
  status: ChatStatus
  metadata: Record<string, unknown>
  archivedAt: number
  createdAt: number
  updatedAt: number
  lastMessageAt: number
  usage?: UsageTotals
}

export interface UsageTotals {
  input: number
  output: number
  total: number
  cost: number
}

export interface ContextUsage {
  usedTokens: number
  limitTokens: number
  percent: number
}

export interface Usage {
  input?: number
  output?: number
  total?: number
  cost?: number
}

export interface Message {
  id: string
  chatId: string
  runId: string
  role: MessageRole
  content: string
  reasoning: string
  toolCalls: ToolCall[]
  toolCallId: string
  name: string
  status: 'streaming' | 'complete' | 'error' | 'cancelled'
  usage: Usage
  metadata: Record<string, unknown>
  createdAt: number
}

export interface Run {
  id: string
  chatId: string
  rootRunId: string
  parentRunId: string
  status: RunStatus
  error: string
  usage: Usage
  startedAt: number
  endedAt: number | null
}

export interface Task {
  id: string
  runId: string
  rootRunId: string
  rootChatId: string
  chatId: string
  parentChatId: string
  parentTaskId: string
  agentId: string
  title: string
  instructions: string
  providerId: string
  model: string
  status: TaskStatus
  depth: number
  error: string
  result: string
  usage: Usage
  startedAt: number | null
  endedAt: number | null
  createdAt: number
}

export interface AppSettings {
  defaultProviderId: string
  defaultModel: string
  maxDepth: number
  maxParallel: number
  maxAgents: number
  maxSteps: number
  workspaceName: string
  autoTitle: boolean
}

export interface ChatDetail {
  chat: Chat
  messages: Message[]
  tasks: Task[]
  runs: Run[]
  files: ChatFile[]
  queue: QueuedMessage[]
  usage: UsageTotals
  context: ContextUsage
  orchestrationRunId: string
}

export interface QueuedMessage {
  id: string
  chatId: string
  projectId: string
  content: string
  fileIds: string[]
  createdAt: number
}

export interface WorkspaceFile {
  path: string
  name: string
  size: number
  modifiedAt: number
}

export interface Artifact {
  id: string
  projectId: string
  agentId: string
  chatId: string
  name: string
  path: string
  fileId: string
  source: 'workspace' | 'upload'
  size: number
  modifiedAt: number
  createdAt: number
}

export interface PreviewSheet {
  name: string
  rows: string[][]
}

export interface PreviewPayload {
  kind: 'pdf' | 'image' | 'text' | 'spreadsheet' | 'document' | 'unsupported'
  name: string
  mimeType: string
  size: number
  content?: string
  truncated?: boolean
  sheets?: PreviewSheet[]
  html?: string
  message?: string
  warnings?: string[]
}

export interface AgentLink {
  id: string
  projectId: string
  agentA: string
  agentB: string
  createdAt: number
}

export interface AgentMemory {
  id: string
  projectId: string
  agentId: string
  title: string
  content: string
  source: string
  createdAt: number
}

export interface ChatFile {
  id: string
  projectId: string
  chatId: string
  messageId: string
  name: string
  storedPath: string
  mimeType: string
  size: number
  createdAt: number
}

export interface MemoryGraph {
  projectId: string
  agents: Agent[]
  links: AgentLink[]
  memories: AgentMemory[]
}

export interface BusEvent {
  type: string
  at: number
  [key: string]: unknown
}
