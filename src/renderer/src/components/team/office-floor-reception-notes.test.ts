import { describe, expect, it } from 'vitest'
import { rectsOverlap } from './office-floor-geometry'
import { officeFloorPlan } from './office-floor-plan'
import {
  RECEPTION_PILE_LIMIT,
  receptionNoteSheets,
  receptionWaitingLabel
} from './office-floor-reception-notes'
import { floorWork } from './office-floor-work'
import { collectTeamAttention } from './team-attention'
import { makeTeamMember, makeTeamSnapshot } from './team-snapshot-test-fixtures'

const VARIANTS = ['narrow', 'medium', 'wide'] as const
const { noteTray } = officeFloorPlan('wide', 1).fixtures

describe('receptionNoteSheets', () => {
  it('leaves the tray empty while nothing waits on the human', () => {
    expect(receptionNoteSheets(noteTray, 0)).toEqual([])
  })

  it('adds a sheet per thing waiting, until the pile is full', () => {
    expect(receptionNoteSheets(noteTray, 1)).toHaveLength(1)
    expect(receptionNoteSheets(noteTray, 3)).toHaveLength(3)
    expect(receptionNoteSheets(noteTray, RECEPTION_PILE_LIMIT)).toHaveLength(RECEPTION_PILE_LIMIT)
    expect(receptionNoteSheets(noteTray, 40)).toHaveLength(RECEPTION_PILE_LIMIT)
  })

  it('stacks the pile upward from inside the tray, on the reception desk', () => {
    for (const variant of VARIANTS) {
      const { noteTray: tray, receptionDesk } = officeFloorPlan(variant, 2).fixtures
      const sheets = receptionNoteSheets(tray, RECEPTION_PILE_LIMIT)
      const [bottom] = sheets
      expect(bottom.y + bottom.h, variant).toBeLessThan(tray.y + tray.h)
      expect(bottom.y, variant).toBeGreaterThan(tray.y)
      sheets.forEach((sheet, index) => {
        expect(sheet.x, variant).toBeGreaterThan(tray.x)
        expect(sheet.x + sheet.w, variant).toBeLessThan(tray.x + tray.w)
        expect(sheet.x + sheet.w, variant).toBeLessThanOrEqual(receptionDesk.x + receptionDesk.w)
        for (const other of sheets.slice(index + 1)) {
          expect(rectsOverlap(sheet, other), variant).toBe(false)
          expect(other.y, variant).toBeLessThan(sheet.y)
        }
      })
    }
  })
})

describe('reception waiting count', () => {
  it('names the count on the button', () => {
    expect(receptionWaitingLabel(1)).toBe('1 waiting on you')
    expect(receptionWaitingLabel(12)).toBe('12 waiting on you')
  })

  it('is the Inbox count: whatever collectTeamAttention counts', () => {
    const ada = makeTeamMember({ id: 'ada', agent_status: 'permission' })
    const snapshot = makeTeamSnapshot({
      members: [ada, makeTeamMember({ id: 'bo', live_handle: 'term_2' })],
      pendingQuestions: [
        {
          message_id: 'msg_1',
          asker_handle: 'term_2',
          subject: 'Which schema?',
          body: '',
          created_at: '2026-09-28 10:00:00'
        }
      ],
      pendingGates: [{ id: 'gate_1', task_id: 'task_1', question: 'Ship?', options: '[]' }],
      pendingHires: [
        {
          id: 'hire_1',
          slug: 'qa',
          display_name: 'Quinn',
          role_slug: 'qa',
          role_brief: '',
          agent: 'claude',
          model: null,
          rationale: ''
        }
      ]
    })
    const attention = collectTeamAttention(snapshot)
    expect(attention.count).toBe(4)
    const work = floorWork({
      goals: snapshot.goals,
      tasks: snapshot.tasks,
      members: snapshot.members,
      desks: [],
      waiting: attention.count
    })
    expect(work.waiting).toBe(attention.count)
    expect(receptionNoteSheets(noteTray, work.waiting)).toHaveLength(RECEPTION_PILE_LIMIT)
    expect(receptionWaitingLabel(work.waiting)).toBe('4 waiting on you')

    const quiet = collectTeamAttention(makeTeamSnapshot({ members: [makeTeamMember()] }))
    expect(quiet.count).toBe(0)
    expect(receptionNoteSheets(noteTray, quiet.count)).toEqual([])
  })
})
