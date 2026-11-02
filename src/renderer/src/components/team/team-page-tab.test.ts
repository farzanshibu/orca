import { describe, expect, it } from 'vitest'
import { DEFAULT_TEAM_PAGE_TAB, TEAM_PAGE_TABS, isTeamPageTab } from './team-page-tab'

describe('team page tab', () => {
  it('accepts only a tab the page has', () => {
    expect(TEAM_PAGE_TABS.every(isTeamPageTab)).toBe(true)
    expect(DEFAULT_TEAM_PAGE_TAB).toBe('orchestrator')
    expect(isTeamPageTab('temps')).toBe(true)
    expect(isTeamPageTab('settings')).toBe(false)
    expect(isTeamPageTab('floor')).toBe(false)
    expect(isTeamPageTab('')).toBe(false)
  })
})
