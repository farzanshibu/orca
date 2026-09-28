import { z } from 'zod'
import {
  OptionalBoolean,
  OptionalFiniteNumber,
  OptionalString,
  requiredString
} from './rpc-param-primitives'
import { TeamHireTemplateSchema, TeamMemberCapabilitiesSchema } from '../team-capabilities'
import { TeamMissionScheduleSchema } from '../team-mission-schedule'

// Why open strings for statuses and agents: params are validated by the host, so a newer client's
// value must reach it as data rather than be refused by an older host's closed enum.

const TeamSelector = {
  team: requiredString('Missing --team'),
  repo: OptionalString
}

export const TeamCreateParams = z.object({
  repo: requiredString('Missing --repo'),
  name: requiredString('Missing --name'),
  charter: OptionalString
})

export const TeamListParams = z.object({
  repo: OptionalString,
  includeArchived: OptionalBoolean
})

export const TeamShowParams = z.object(TeamSelector)

export const TeamLogParams = z.object({
  ...TeamSelector,
  limit: OptionalFiniteNumber
})

export const TeamUpdateParams = z.object({
  ...TeamSelector,
  charter: OptionalString,
  status: OptionalString
})

const MemberFields = {
  displayName: OptionalString,
  role: OptionalString,
  brief: OptionalString,
  agent: OptionalString,
  model: OptionalString,
  effort: OptionalString
}

export const TeamMemberAddParams = z.object({
  ...TeamSelector,
  slug: requiredString('Missing --slug'),
  ...MemberFields,
  role: requiredString('Missing --role'),
  agent: requiredString('Missing --agent'),
  manager: OptionalBoolean,
  capabilities: TeamMemberCapabilitiesSchema.optional()
})

export const TeamMemberParams = z.object({
  ...TeamSelector,
  member: requiredString('Missing --member')
})

export const TeamMemberUpdateParams = z.object({
  ...TeamSelector,
  member: requiredString('Missing --member'),
  ...MemberFields
})

export const TeamMemberSendParams = z.object({
  ...TeamSelector,
  member: requiredString('Missing --member'),
  text: requiredString('Missing --text'),
  /** Interrupt the agent's current turn first: the operator's "halt and steer". */
  interrupt: OptionalBoolean
})

export const TeamMemberCapParams = z.object({
  ...TeamSelector,
  member: requiredString('Missing --member'),
  /** API-equivalent USD; null removes the cap. */
  capUsd: z.number().finite().nonnegative().nullable(),
  /** Omitted keeps the current token cap; null removes it. */
  tokenCap: z.number().int().positive().nullable().optional()
})

export const TeamQueueAddParams = z.object({
  ...TeamSelector,
  member: requiredString('Missing --member'),
  text: requiredString('Missing --text')
})

export const TeamQueueReorderParams = z.object({
  ...TeamSelector,
  member: requiredString('Missing --member'),
  order: z.array(z.string().min(1)).max(500)
})

export const TeamQueueRemoveParams = z.object({
  ...TeamSelector,
  id: requiredString('Missing --id')
})

export const TeamMemberCapabilitiesParams = z.object({
  ...TeamSelector,
  member: requiredString('Missing --member'),
  capabilities: TeamMemberCapabilitiesSchema
})

export const TeamMemberImportParams = z.object({
  ...TeamSelector,
  template: TeamHireTemplateSchema,
  /** Defaults to a slug derived from the template name. */
  slug: OptionalString
})

export const TeamAnswerParams = z.object({
  ...TeamSelector,
  id: requiredString('Missing --id'),
  body: requiredString('Missing --body')
})

export const TeamGateResolveParams = z.object({
  ...TeamSelector,
  id: requiredString('Missing --id'),
  resolution: requiredString('Missing --resolution')
})

export const TeamHireProposeParams = z.object({
  ...TeamSelector,
  slug: requiredString('Missing --slug'),
  ...MemberFields,
  role: requiredString('Missing --role'),
  agent: requiredString('Missing --agent'),
  rationale: OptionalString
})

export const TeamHireDecideParams = z.object({
  ...TeamSelector,
  id: requiredString('Missing --id'),
  decision: requiredString('Missing --decision'),
  note: OptionalString,
  /** Start the new member right after approval. */
  start: OptionalBoolean
})

export const TeamMissionAddParams = z.object({
  ...TeamSelector,
  name: requiredString('Missing --name'),
  target: OptionalString,
  prompt: requiredString('Missing --prompt'),
  schedule: TeamMissionScheduleSchema
})

export const TeamMissionParams = z.object({
  ...TeamSelector,
  id: requiredString('Missing --id')
})

export const TeamMissionEnableParams = z.object({
  ...TeamSelector,
  id: requiredString('Missing --id'),
  enabled: z.boolean()
})

export const TeamTriggersSetParams = z.object({
  ...TeamSelector,
  triggerMode: OptionalString,
  autoCompactTokens: z.number().int().min(10_000).nullable().optional(),
  webhook: z.enum(['enable', 'disable', 'rotate']).optional()
})

export const TeamMemoryParams = z.object({
  ...TeamSelector,
  query: OptionalString,
  limit: OptionalFiniteNumber
})

export const TeamNoteParams = z.object({
  ...TeamSelector,
  /** `board`, `members/<slug>`, or `notes/<name>`. */
  note: requiredString('Missing --note')
})

export const TeamNoteWriteParams = z.object({
  ...TeamSelector,
  note: requiredString('Missing --note'),
  content: z.string().max(200_000)
})

export const TeamTaskCreateParams = z.object({
  ...TeamSelector,
  title: requiredString('Missing --title'),
  spec: OptionalString,
  /** Hand the rough request to the manager to rewrite into a full task instead of filing it as is. */
  enrich: OptionalBoolean
})

export const TeamClosingTimeParams = z.object({
  ...TeamSelector,
  /** Call off a Closing Time in progress; members already stopped stay stopped. */
  cancel: OptionalBoolean
})
