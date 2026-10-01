import { TEAM_ACTIVITY_METHODS } from './team-activity-methods'
import { TEAM_AUTOMATION_METHODS } from './team-automation-methods'
import { TEAM_CAPABILITY_METHODS } from './team-capability-methods'
import { TEAM_GOAL_METHODS } from './team-goal-methods'
import { TEAM_MEMORY_METHODS } from './team-memory-methods'
import { TEAM_HIRE_METHODS } from './team-hire-methods'
import { TEAM_INBOX_METHODS } from './team-inbox-methods'
import { TEAM_MEMBER_METHODS } from './team-member-methods'
import { TEAM_METHODS } from './team-methods'
import { TEAM_QUEUE_METHODS } from './team-queue-methods'
import { TEAM_TASK_METHODS } from './team-task-methods'

export const ORCHESTRATION_TEAM_METHODS = [
  ...TEAM_METHODS,
  ...TEAM_MEMBER_METHODS,
  ...TEAM_INBOX_METHODS,
  ...TEAM_HIRE_METHODS,
  ...TEAM_QUEUE_METHODS,
  ...TEAM_CAPABILITY_METHODS,
  ...TEAM_AUTOMATION_METHODS,
  ...TEAM_MEMORY_METHODS,
  ...TEAM_TASK_METHODS,
  ...TEAM_GOAL_METHODS,
  ...TEAM_ACTIVITY_METHODS
]
