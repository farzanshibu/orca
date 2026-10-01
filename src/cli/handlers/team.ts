import type { CommandHandler } from '../dispatch'
import { TEAM_AUTOMATION_HANDLERS } from './team/team-automation-handlers'
import { TEAM_CORE_HANDLERS } from './team/team-core-handlers'
import { TEAM_MEMBER_HANDLERS } from './team/team-member-handlers'
import { TEAM_MEMORY_HANDLERS } from './team/team-memory-handlers'
import { TEAM_TASK_HANDLERS } from './team/team-task-handlers'

export const TEAM_HANDLERS: Record<string, CommandHandler> = {
  ...TEAM_CORE_HANDLERS,
  ...TEAM_MEMBER_HANDLERS,
  ...TEAM_AUTOMATION_HANDLERS,
  ...TEAM_MEMORY_HANDLERS,
  ...TEAM_TASK_HANDLERS
}
