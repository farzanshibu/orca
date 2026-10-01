import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import { floorThought } from './office-floor-thought'
import type { TeamMember } from './team-snapshot-types'

/**
 * Each member's thought-cloud line, by member id, from the agent status the host pushes per pane.
 * One store subscription for the whole floor, compared shallowly, so it re-renders only when a
 * line changes: no poll, and nothing per member.
 */
export function useFloorThoughts(members: readonly TeamMember[]): Readonly<Record<string, string>> {
  return useAppStore(
    useShallow((state) =>
      Object.fromEntries(
        members.flatMap((member) => {
          const status = member.pane_key ? state.agentStatusByPaneKey[member.pane_key] : undefined
          return status ? [[member.id, floorThought(status.toolName, status.toolInput)]] : []
        })
      )
    )
  )
}
