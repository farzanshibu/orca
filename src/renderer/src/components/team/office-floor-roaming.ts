import type { FloorActivity } from './office-floor-state'

/** How long an idle character lingers before wandering to the next spot. */
export const ROAM_INTERVAL_MS = 9_000

/** At their own desk, at one of the layout's idle spots, or out of the office entirely. */
export type RoamTarget = { kind: 'desk' } | { kind: 'spot'; index: number } | { kind: 'away' }

export function stableHash(seed: string): number {
  let hash = 0
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0
  }
  return Math.abs(hash)
}

/**
 * Where each member is this tick. Desk-bound members sit at their desk; offline ones are out of the
 * office; idle ones wander between free spots, never two on one spot, and fall back to their desk
 * when every spot is taken.
 */
export function roamTargets(
  members: readonly { id: string; slug: string; activity: FloorActivity }[],
  spotCount: number,
  tick: number
): Map<string, RoamTarget> {
  const targets = new Map<string, RoamTarget>()
  const taken = new Set<number>()
  for (const member of members) {
    if (member.activity === 'off') {
      targets.set(member.id, { kind: 'away' })
      continue
    }
    if (member.activity !== 'idle' || spotCount === 0) {
      targets.set(member.id, { kind: 'desk' })
      continue
    }
    const start = (stableHash(member.slug) + tick * (1 + (stableHash(member.id) % 3))) % spotCount
    let target: RoamTarget = { kind: 'desk' }
    for (let step = 0; step < spotCount; step += 1) {
      const index = (start + step) % spotCount
      if (!taken.has(index)) {
        taken.add(index)
        target = { kind: 'spot', index }
        break
      }
    }
    targets.set(member.id, target)
  }
  return targets
}
