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
export type ChatStatus = 'idle' | 'running' | 'error'

export interface ToolCall {
  id: string
  name: string
  arguments: string
}

export interface Usage {
  input?: number
  output?: number
  total?: number
  cost?: number
}

export interface Provider {
  id: string
  name: string
  kind: ProviderKind
  baseUrl: string
  apiVersion: string
  defaultModel: string
  models: string[]
  config: Record<string, unknown>
  hasKey: boolean
  createdAt: number
  updatedAt: number
}

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
  kind: 'root' | 'agent' | 'direct'
  status: ChatStatus
  metadata: Record<string, unknown>
  archivedAt: number
  createdAt: number
  updatedAt: number
  lastMessageAt: number
  messageCount?: number
  childCount?: number
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

export interface Bootstrap {
  providers: Provider[]
  projects: Project[]
  agents: Agent[]
  chats: Chat[]
  settings: AppSettings
  activeRuns: Run[]
  providerKinds: ProviderKind[]
  authRequired: boolean
}

export interface ChatDetail {
  chat: Chat
  messages: Message[]
  tasks: Task[]
  runs: Run[]
  files: ChatFile[]
  orchestrationRunId: string
  activeRunId: string
}

export type BusEvent = {
  type: string
  at: number
} & Record<string, any>

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

export interface MemoryGraph {
  projectId: string
  agents: Agent[]
  links: AgentLink[]
  memories: AgentMemory[]
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
