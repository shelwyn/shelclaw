export const AGENT_COLORS = [
  '#7c6cff',
  '#38bdf8',
  '#34d399',
  '#f59e0b',
  '#f472b6',
  '#a78bfa',
  '#fb7185',
  '#2dd4bf',
  '#60a5fa',
  '#facc15',
]

export function pickColor(seed = Date.now()): string {
  return AGENT_COLORS[Math.abs(seed) % AGENT_COLORS.length]
}
