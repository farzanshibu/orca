export const TEAM_PAGE_TABS = [
  'floor',
  'agents',
  'orchestrator',
  'tasks',
  'inbox',
  'automations',
  'memory'
] as const

export type TeamPageTab = (typeof TEAM_PAGE_TABS)[number]

export const DEFAULT_TEAM_PAGE_TAB: TeamPageTab = 'floor'

export function isTeamPageTab(value: string): value is TeamPageTab {
  return TEAM_PAGE_TABS.some((tab) => tab === value)
}
