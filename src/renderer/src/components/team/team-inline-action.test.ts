import { describe, expect, it, vi } from 'vitest'
import { runTeamActionInline, teamActionErrorMessage } from './team-inline-action'
import type { TeamAct } from './use-team-page-state'

/** `act` as the page state implements it: a rejection becomes the page banner and `false`. */
function pageAct(): { act: TeamAct; keys: string[]; bannerErrors: unknown[] } {
  const keys: string[] = []
  const bannerErrors: unknown[] = []
  const act: TeamAct = async (mutation, key = 'action') => {
    keys.push(key)
    try {
      await mutation()
    } catch (error) {
      bannerErrors.push(error)
      return false
    }
    return true
  }
  return { act, keys, bannerErrors }
}

describe('runTeamActionInline', () => {
  it('runs the call under its own pending key and returns what it resolved to', async () => {
    const page = pageAct()
    const outcome = await runTeamActionInline(page.act, 'goal-create', async () => ({
      ref: 'bmt-3'
    }))
    expect(outcome).toEqual({ ok: true, value: { ref: 'bmt-3' } })
    expect(page.keys).toEqual(['goal-create'])
  })

  it('hands a failure back instead of to the page banner', async () => {
    const page = pageAct()
    const failure = new Error('Team Platform is paused; resume it before giving it a goal.')
    const outcome = await runTeamActionInline(page.act, 'goal-create', () =>
      Promise.reject(failure)
    )
    expect(outcome).toEqual({ ok: false, error: failure })
    expect(page.bannerErrors).toEqual([])
  })

  it('reports a call the page never ran as a failure', async () => {
    const call = vi.fn(async () => 1)
    const outcome = await runTeamActionInline(async () => false, 'goal-create', call)
    expect(outcome.ok).toBe(false)
    expect(call).not.toHaveBeenCalled()
  })
})

describe('teamActionErrorMessage', () => {
  it('reads an error and anything else thrown', () => {
    expect(teamActionErrorMessage(new Error('No such goal.'))).toBe('No such goal.')
    expect(teamActionErrorMessage('refused')).toBe('refused')
  })
})
