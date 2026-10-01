// A cloud is as wide as a desk at most, so anything longer would only be cut off by it.
const TARGET_MAX = 32

/** The last part of a path, or the start of anything else, on one line. */
function thoughtTarget(toolInput: string): string {
  const line = toolInput.trim().replace(/\s+/g, ' ')
  const path = /^\S*[\\/]\S*$/.test(line)
    ? (line.split(/[\\/]/).findLast((part) => part.length > 0) ?? line)
    : line
  return path.length > TARGET_MAX ? `${path.slice(0, TARGET_MAX - 1)}…` : path
}

/**
 * What a working member's thought cloud says: the tool in hand and what it is aimed at, short
 * enough to read across the room. Empty when the agent has reported no tool.
 */
export function floorThought(toolName: string | undefined, toolInput: string | undefined): string {
  const tool = toolName?.trim() ?? ''
  if (!tool) {
    return ''
  }
  const target = thoughtTarget(toolInput ?? '')
  return target ? `${tool} · ${target}` : tool
}
