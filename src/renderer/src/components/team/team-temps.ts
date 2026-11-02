import { useEffect, useRef } from 'react'
import type { RuntimeClientTarget } from '@/runtime/runtime-client-target'
import { toTeamSlug } from '../../../../shared/team-slug'
import { runTeamMemberAction } from './team-runtime-client'
import type { TeamMember, TeamSnapshot, TeamTask } from './team-snapshot-types'
import type { TeamAct } from './use-team-page-state'

/** Temps are ordinary members with a reserved role, so an older host still lists and removes them. */
export const TEAM_TEMP_ROLE = 'temp'

export function isTeamTemp(member: TeamMember): boolean {
  return member.role_slug === TEAM_TEMP_ROLE
}

export function teamTempTasks(member: TeamMember, tasks: readonly TeamTask[]): TeamTask[] {
  return tasks.filter((task) => task.assignee_member_id === member.id)
}

/** The one job a temp was hired for: its newest assigned task. */
export function teamTempJob(member: TeamMember, tasks: readonly TeamTask[]): TeamTask | undefined {
  return teamTempTasks(member, tasks).sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
}

function settled(task: TeamTask): boolean {
  return task.status === 'completed' || task.status === 'failed'
}

/** True once every ticket the temp was given has finished, so it has nothing left to do. */
export function teamTempFinished(member: TeamMember, tasks: readonly TeamTask[]): boolean {
  const owned = teamTempTasks(member, tasks)
  return owned.length > 0 && owned.every(settled)
}

export function makeTeamTempSlug(
  displayName: string,
  suffix = Date.now().toString(36).slice(-4)
): string {
  const base = toTeamSlug(displayName) ?? 'agent'
  return `temp-${base.slice(0, 26)}-${suffix}`.replace(/-+$/, '')
}

export function teamTempJobTitle(job: string): string {
  return job.trim().split(/\r?\n/)[0]?.slice(0, 120) || 'One job'
}

/** How far the one job has moved, for the temp's progress bar. */
export function teamTempProgress(job: TeamTask | undefined): number {
  if (!job) {
    return 8
  }
  switch (job.status) {
    case 'pending':
      return 12
    case 'ready':
      return 25
    case 'blocked':
      return 45
    case 'dispatched':
      return 68
    case 'completed':
    case 'failed':
      return 100
    default:
      return 35
  }
}

export type TeamTempPhase = 'hired' | 'working' | 'paused' | 'off' | 'done' | 'failed'

export function teamTempPhase(
  member: TeamMember,
  job: TeamTask | undefined,
  liveness: string
): TeamTempPhase {
  if (job?.status === 'completed') {
    return 'done'
  }
  if (job?.status === 'failed') {
    return 'failed'
  }
  if (member.paused_at) {
    return 'paused'
  }
  if (!job) {
    return 'hired'
  }
  return liveness === 'stopped' ? 'off' : 'working'
}

/** Removes each temp as soon as its job settles. `act` owns the refresh that hides the row. */
export function useTeamTempRetirement({
  target,
  snapshot,
  pendingActions,
  act
}: {
  target: RuntimeClientTarget
  snapshot: TeamSnapshot | null
  pendingActions: readonly string[]
  act: TeamAct
}): void {
  const attempted = useRef(new Set<string>())
  useEffect(() => {
    if (!snapshot) {
      return
    }
    const busy = new Set(pendingActions)
    for (const member of snapshot.members) {
      if (!isTeamTemp(member) || !teamTempFinished(member, snapshot.tasks)) {
        continue
      }
      if (attempted.current.has(member.id) || busy.has(member.id) || busy.has('temp-retire')) {
        continue
      }
      attempted.current.add(member.id)
      void act(
        () =>
          runTeamMemberAction(target, {
            team: snapshot.team.id,
            member: member.id,
            action: 'Remove'
          }),
        'temp-retire'
      )
    }
  }, [act, pendingActions, snapshot, target])
}
