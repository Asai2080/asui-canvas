const ENABLED_VALUES = new Set(["1", "true", "yes", "on"])

export function parseBooleanFlag(value?: string) {
  return value ? ENABLED_VALUES.has(value.trim().toLowerCase()) : false
}

export function isCanvasAgentEnabled(
  env: Record<string, string | undefined> = process.env
) {
  return parseBooleanFlag(env.NEXT_PUBLIC_CANVAS_AGENT_ENABLED)
}
