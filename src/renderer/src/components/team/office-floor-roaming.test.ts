import { describe, expect, it } from 'vitest'
import { IDLE_SPOTS, roamTargets } from './office-floor-roaming'

const member = (id: string, activity: 'working' | 'idle' | 'waiting' | 'off') => ({
  id,
  slug: id,
  activity
})

describe('office floor roaming', () => {
  it('seats desk-bound members at their own desk and rests offline ones in bedrooms', () => {
    const targets = roamTargets(
      [member('a', 'working'), member('b', 'waiting'), member('c', 'off'), member('d', 'off')],
      0
    )
    expect(targets.get('a')?.anchor).toBe('desk-a')
    expect(targets.get('b')?.anchor).toBe('desk-b')
    expect(targets.get('c')?.anchor).toBe('bedroom-0')
    expect(targets.get('d')?.anchor).toBe('bedroom-1')
  })

  it('never puts two idle members on one spot', () => {
    const idle = Array.from({ length: IDLE_SPOTS.length }, (_, index) =>
      member(`m${index}`, 'idle')
    )
    for (const tick of [0, 1, 7]) {
      const spots = [...roamTargets(idle, tick).values()].map((target) => target.anchor)
      expect(new Set(spots).size).toBe(idle.length)
    }
  })

  it('moves idle members over time', () => {
    const idle = [member('qa', 'idle'), member('docs', 'idle')]
    const seen = new Set([0, 1, 2, 3].map((tick) => roamTargets(idle, tick).get('qa')?.anchor))
    expect(seen.size).toBeGreaterThan(1)
  })
})
