export const TEAM_PAGE_TABS = [
  'orchestrator',
  'agents',
  'tasks',
  'inbox',
  'automations',
  'memory',
  'capabilities',
  'temps'
] as const

export type TeamPageTab = (typeof TEAM_PAGE_TABS)[number]

export const DEFAULT_TEAM_PAGE_TAB: TeamPageTab = 'orchestrator'

export function isTeamPageTab(value: string): value is TeamPageTab {
  return TEAM_PAGE_TABS.some((tab) => tab === value)
}
