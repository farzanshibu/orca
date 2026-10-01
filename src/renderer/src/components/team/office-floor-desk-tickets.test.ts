import { describe, expect, it } from 'vitest'
import { deskTicketSpot, deskTickets } from './office-floor-desk-tickets'
import { rectContainsPoint, rectsOverlap } from './office-floor-geometry'
import { officeFloorPlan, type FloorDesk, type FloorVariant } from './office-floor-plan'
import { makeTeamMember, makeTeamTask } from './team-snapshot-test-fixtures'
import type { TeamMember, TeamTask } from './team-snapshot-types'
import { teamMemberCurrentTask } from './team-task-owner'

const VARIANTS: readonly FloorVariant[] = ['narrow', 'medium', 'wide']
// A chip is one 14px line with a border; a seven-character ref in 11px mono is about this wide.
const CHIP_PX = { w: 56, h: 16 }
// A name and a status line, 14px each.
const NAMEPLATE_PX = 28

function allDesks(variant: FloorVariant, pods: number): FloorDesk[] {
  const plan = officeFloorPlan(variant, pods)
  return [plan.managerDesk, ...plan.pods.flatMap((pod) => pod.desks)]
}

function seated(members: readonly TeamMember[], tasks: readonly TeamTask[]) {
  const desks = allDesks('wide', 1)
  return desks.map((desk, index) => {
    const member = members.at(index)
    return {
      desk,
      entry: member ? { member, task: teamMemberCurrentTask(member, tasks) } : undefined
    }
  })
}

describe('deskTickets', () => {
  it('puts a ticket only on the desk of a member with a current task, showing its ref', () => {
    const tasks = [makeTeamTask({ id: 'task_7', ref: 'imp-7', status: 'dispatched' })]
    const members = [
      makeTeamMember({ id: 'lead', is_manager: 1, current_task: null }),
      makeTeamMember({
        id: 'ada',
        current_task: { task_id: 'task_7', ref: 'imp-7', dispatch_id: 'dispatch_1' }
      }),
      makeTeamMember({ id: 'bo', current_task: null })
    ]
    const desks = seated(members, tasks)
    expect(deskTickets(desks)).toEqual([
      { memberId: 'ada', ref: 'imp-7', at: deskTicketSpot(desks[1].desk) }
    ])
  })

  it('leaves vacant desks and members between tasks without one', () => {
    expect(deskTickets(seated([], []))).toEqual([])
    expect(deskTickets(seated([makeTeamMember({ current_task: null })], []))).toEqual([])
  })

  it('reads the ref from the task when the host names the task but not its ref', () => {
    const tasks = [makeTeamTask({ id: 'task_7', ref: 'imp-7' })]
    const member = makeTeamMember({
      id: 'ada',
      current_task: { task_id: 'task_7', ref: null, dispatch_id: 'dispatch_1' }
    })
    expect(deskTickets(seated([member], tasks)).map(({ ref }) => ref)).toEqual(['imp-7'])
  })

  it('falls back to the dispatched task on the member’s handle for a host that sends no current task', () => {
    const tasks = [
      makeTeamTask({ id: 'task_9', ref: 'imp-9', status: 'dispatched', assignee_handle: 'term_1' })
    ]
    const member = makeTeamMember({ id: 'ada', live_handle: 'term_1' })
    expect(deskTickets(seated([member], tasks)).map(({ ref }) => ref)).toEqual(['imp-9'])
  })

  it('shows nothing for a task with no ref to read', () => {
    const tasks = [makeTeamTask({ id: 'task_7', ref: null })]
    const member = makeTeamMember({
      current_task: { task_id: 'task_7', ref: null, dispatch_id: 'dispatch_1' }
    })
    expect(deskTickets(seated([member], tasks))).toEqual([])
  })
})

describe('deskTicketSpot', () => {
  it('pins the chip on the desk it belongs to', () => {
    for (const variant of VARIANTS) {
      for (const desk of allDesks(variant, 3)) {
        expect(rectContainsPoint(desk.top, deskTicketSpot(desk)), desk.anchor).toBe(true)
        expect(rectContainsPoint(desk.cell, deskTicketSpot(desk)), desk.anchor).toBe(true)
      }
    }
  })

  it('keeps the chip clear of every nameplate, from the smallest floor to the largest', () => {
    for (const variant of VARIANTS) {
      const desks = allDesks(variant, 5)
      for (const pxPerUnit of [1.2, 1.9, 2.2, 3]) {
        const chips = desks.map((desk) => {
          const at = deskTicketSpot(desk)
          const w = CHIP_PX.w / pxPerUnit
          const h = CHIP_PX.h / pxPerUnit
          return { x: at.x - w / 2, y: at.y - h / 2, w, h }
        })
        const plates = desks.map(({ nameplate, cell }) => {
          const h = NAMEPLATE_PX / pxPerUnit
          return {
            x: nameplate.at.x - cell.w / 2,
            y: nameplate.above ? nameplate.at.y - h : nameplate.at.y,
            w: cell.w,
            h
          }
        })
        for (const [index, chip] of chips.entries()) {
          for (const plate of plates) {
            expect(
              rectsOverlap(chip, plate),
              `${variant} at ${pxPerUnit}px per unit: ${desks[index].anchor}`
            ).toBe(false)
          }
        }
      }
    }
  })
})
