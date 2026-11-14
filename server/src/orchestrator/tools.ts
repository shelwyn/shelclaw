import { z } from 'zod'
import type { Agent, Chat, McpToolSummary } from '../types.js'
import type { ToolDefinition } from '../providers/types.js'

export const SPAWN_TOOL = 'spawn_agents'
export const SEND_TO_CHAT_TOOL = 'send_to_chat'
export const MCP_CALL_TOOL = 'mcp_call'

export const spawnArgsSchema = z.object({
  tasks: z
    .array(
      z.object({
        title: z.string().min(1).max(160),
        instructions: z.string().min(1),
        agent: z.string().optional(),
        provider: z.string().optional(),
        model: z.string().optional(),
      }),
    )
    .min(1)
    .max(12),
})

export type SpawnArgs = z.infer<typeof spawnArgsSchema>

export const sendToChatArgsSchema = z.object({
  chat: z.string().min(1).max(200),
  message: z.string().min(1),
  title: z.string().max(160).optional(),
})

export type SendToChatArgs = z.infer<typeof sendToChatArgsSchema>

export const mcpCallArgsSchema = z.object({
  server: z.string().min(1).max(200),
  tool: z.string().min(1).max(200),
  arguments: z.record(z.string(), z.unknown()).optional(),
})

export type McpCallArgs = z.infer<typeof mcpCallArgsSchema>

export function buildMcpCallTool(tools: McpToolSummary[]): ToolDefinition {
  const catalog = tools
    .slice(0, 120)
    .map(
      (tool) =>
        `- server "${tool.serverName}", tool "${tool.name}"${tool.description ? `: ${tool.description}` : ''}`,
    )
    .join('\n')
  return {
    name: MCP_CALL_TOOL,
    description: `Call a tool exposed by a connected MCP server. Credentials are handled server-side and are never included in this conversation.

Available MCP tools:
${catalog || '(none)'}`,
    parameters: {
      type: 'object',
      properties: {
        server: { type: 'string', description: 'MCP server name or id.' },
        tool: { type: 'string', description: 'Tool name from the catalog.' },
        arguments: {
          type: 'object',
          description: 'Arguments object matching the MCP tool input schema.',
        },
      },
      required: ['server', 'tool'],
      additionalProperties: false,
    },
  }
}

export function buildSendToChatTool(chats: Chat[]): ToolDefinition {
  const list = chats
    .slice(0, 40)
    .map((chat) => `- "${chat.title}" (id: ${chat.id}, agent id: ${chat.agentId || 'none'})`)
    .join('\n')

  return {
    name: SEND_TO_CHAT_TOOL,
    description: `Send a message or task to an existing chat in this project. Use this to command another chat or agent directly instead of creating a new sub-agent chat. The target run starts in parallel (or is queued if that chat is already running). The message must be self-contained.

Available chats:
${list || '(none)'}`,
    parameters: {
      type: 'object',
      properties: {
        chat: {
          type: 'string',
          description: 'Target chat id or exact title from the list above.',
        },
        message: {
          type: 'string',
          description: 'Complete instruction for the target chat. It cannot see this conversation.',
        },
        title: {
          type: 'string',
          description: 'Optional title if the target chat should be renamed.',
        },
      },
      required: ['chat', 'message'],
      additionalProperties: false,
    },
  }
}

export function buildSpawnTool(agents: Agent[]): ToolDefinition {
  const roster = agents
    .map((agent) => {
      const bits = [`- "${agent.name}" (id: ${agent.id})`]
      if (agent.description) bits.push(`— ${agent.description}`)
      if (agent.model) bits.push(`[default model: ${agent.model}]`)
      return bits.join(' ')
    })
    .join('\n')

  return {
    name: SPAWN_TOOL,
    description: `Delegate self-contained tasks to specialist sub-agents. Sub-agents run in parallel and return their final deliverable. Sub-agents cannot see this conversation, so every instruction must include all needed context, constraints, and expected output format. Call this once with several tasks to parallelize. Sub-agents may spawn their own sub-agents if depth allows.

Available agents:
${roster}

If no agent fits, omit "agent" to use the current specialist agent (or the first available specialist when running as the orchestrator). Use "provider" and "model" only to override the model for a specific task.`,
    parameters: {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          description: 'One or more independent tasks to run in parallel.',
          minItems: 1,
          maxItems: 12,
          items: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: 'Short label shown in the orchestration panel, e.g. "Audit the auth flow".',
              },
              instructions: {
                type: 'string',
                description:
                  'A complete, self-contained brief: goal, context, constraints, tools/files available, and the exact deliverable expected. The sub-agent has no other context.',
              },
              agent: {
                type: 'string',
                description: 'Agent name or id from the roster. Omit to inherit the current agent.',
              },
              provider: {
                type: 'string',
                description: 'Optional provider id or name to override the model provider for this task.',
              },
              model: {
                type: 'string',
                description: 'Optional model id to use for this task, e.g. a stronger model for planning.',
              },
            },
            required: ['title', 'instructions'],
            additionalProperties: false,
          },
        },
      },
      required: ['tasks'],
      additionalProperties: false,
    },
  }
}
