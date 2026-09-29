import { describe, expect, it } from 'vitest'
import { roamTargets } from './office-floor-roaming'

const member = (id: string, activity: 'working' | 'idle' | 'waiting' | 'off') => ({
  id,
  slug: id,
  activity
})

describe('office floor roaming', () => {
  it('seats desk-bound members and sends offline ones out of the office', () => {
    const targets = roamTargets(
      [member('a', 'working'), member('b', 'waiting'), member('c', 'off')],
      4,
      0
    )
    expect(targets.get('a')).toEqual({ kind: 'desk' })
    expect(targets.get('b')).toEqual({ kind: 'desk' })
    expect(targets.get('c')).toEqual({ kind: 'away' })
  })

  it('never puts two idle members on one spot', () => {
    const idle = Array.from({ length: 5 }, (_, index) => member(`m${index}`, 'idle'))
    for (const tick of [0, 1, 7]) {
      const spots = [...roamTargets(idle, 5, tick).values()].map((target) =>
        target.kind === 'spot' ? target.index : -1
      )
      expect(new Set(spots).size).toBe(idle.length)
      expect(spots).not.toContain(-1)
    }
  })

  it('keeps overflow idle members at their desks', () => {
    const idle = Array.from({ length: 3 }, (_, index) => member(`m${index}`, 'idle'))
    const kinds = [...roamTargets(idle, 2, 0).values()].map((target) => target.kind)
    expect(kinds.filter((kind) => kind === 'desk')).toHaveLength(1)
  })

  it('moves idle members over time', () => {
    const idle = [member('qa', 'idle'), member('docs', 'idle')]
    const seen = new Set(
      [0, 1, 2, 3].map((tick) => {
        const target = roamTargets(idle, 8, tick).get('qa')
        return target?.kind === 'spot' ? target.index : -1
      })
    )
    expect(seen.size).toBeGreaterThan(1)
  })
})
