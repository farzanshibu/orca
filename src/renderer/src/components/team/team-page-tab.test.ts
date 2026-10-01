import { describe, expect, it } from 'vitest'
import { DEFAULT_TEAM_PAGE_TAB, TEAM_PAGE_TABS, isTeamPageTab } from './team-page-tab'

describe('team page tab', () => {
  it('accepts only a tab the page has', () => {
    expect(TEAM_PAGE_TABS.every(isTeamPageTab)).toBe(true)
    expect(isTeamPageTab(DEFAULT_TEAM_PAGE_TAB)).toBe(true)
    expect(isTeamPageTab('settings')).toBe(false)
    expect(isTeamPageTab('')).toBe(false)
  })
})
