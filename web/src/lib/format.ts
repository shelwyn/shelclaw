export function relativeTime(timestamp: number): string {
  if (!timestamp) return ''
  const diff = Date.now() - timestamp
  if (diff < 45_000) return 'now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d`
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function duration(start?: number | null, end?: number | null): string {
  if (!start) return ''
  const finish = end || Date.now()
  const seconds = Math.max(0, Math.round((finish - start) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  if (minutes < 60) return rest ? `${minutes}m ${rest}s` : `${minutes}m`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

export function fmtTokens(value?: number): string {
  if (!value) return '0'
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k`
  return String(value)
}

export function fmtCost(value?: number): string {
  if (!value) return '$0.00'
  if (value < 0.01) return '<$0.01'
  if (value < 1) return `$${value.toFixed(3)}`
  return `$${value.toFixed(2)}`
}

export function totalTokens(...usages: Array<{ input?: number; output?: number; total?: number } | undefined>): number {
  return usages.reduce((sum, usage) => {
    if (!usage) return sum
    return sum + (usage.total ?? (usage.input || 0) + (usage.output || 0))
  }, 0)
}

export function timeOfDay(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function modelShort(model: string): string {
  if (!model) return 'default'
  return model.length > 30 ? `${model.slice(0, 28)}…` : model
}

export const HARNESS_KINDS = ['opencode-server', 'opencode', 'claude-code', 'local-harness'] as const

export function isHarnessKind(kind: string): boolean {
  return (HARNESS_KINDS as readonly string[]).includes(kind)
}

export function providerKindLabel(kind: string): string {
  const labels: Record<string, string> = {
    openai: 'OpenAI',
    azure: 'Azure OpenAI',
    anthropic: 'Anthropic',
    ollama: 'Ollama',
    custom: 'OpenAI-compatible',
    opencode: 'OpenCode CLI',
    'opencode-server': 'OpenCode server',
    'claude-code': 'Claude Code CLI',
    'local-harness': 'Local CLI harness',
  }
  return labels[kind] || kind
}

export function plural(count: number, singular: string, pluralForm?: string): string {
  return count === 1 ? singular : pluralForm || `${singular}s`
}

export function clampText(text: string, length: number): string {
  return text.length > length ? `${text.slice(0, length - 1)}…` : text
}
