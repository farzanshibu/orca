import type { FloorActivity } from './office-floor-state'

/** Named places a character can stand; the plan marks each with `data-floor-anchor`. */
export const IDLE_SPOTS = [
  'couch-0',
  'couch-1',
  'couch-2',
  'couch-3',
  'table',
  'kitchen',
  'fridge',
  'board',
  'stool-0',
  'stool-1',
  'stool-2',
  'door'
] as const

export const BEDROOM_COUNT = 2
/** How long an idle character lingers before wandering to the next spot. */
export const ROAM_INTERVAL_MS = 9_000

export type RoamTarget = { anchor: string; slot: number }

export function stableHash(seed: string): number {
  let hash = 0
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0
  }
  return Math.abs(hash)
}

/**
 * Where each member stands this tick. Desk-bound members sit in their desk chair; offline ones rest
 * in a bedroom; idle ones wander between free spots, never two on one spot.
 */
export function roamTargets(
  members: readonly { id: string; slug: string; activity: FloorActivity }[],
  tick: number
): Map<string, RoamTarget> {
  const targets = new Map<string, RoamTarget>()
  const taken = new Set<string>()
  let resting = 0
  for (const member of members) {
    if (member.activity === 'working' || member.activity === 'waiting') {
      targets.set(member.id, { anchor: `desk-${member.id}`, slot: 0 })
    } else if (member.activity === 'off') {
      targets.set(member.id, {
        anchor: `bedroom-${resting % BEDROOM_COUNT}`,
        slot: Math.floor(resting / BEDROOM_COUNT)
      })
      resting += 1
    }
  }
  for (const member of members) {
    if (member.activity !== 'idle') {
      continue
    }
    const start =
      (stableHash(member.slug) + tick * (1 + (stableHash(member.id) % 3))) % IDLE_SPOTS.length
    for (let step = 0; step < IDLE_SPOTS.length; step += 1) {
      const spot = IDLE_SPOTS[(start + step) % IDLE_SPOTS.length]
      if (!taken.has(spot)) {
        taken.add(spot)
        targets.set(member.id, { anchor: spot, slot: 0 })
        break
      }
    }
  }
  return targets
}
