import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { initialChoreography } from './office-choreography'
import { floorScene, type FloorScene } from './office-choreography-scene'
import {
  choreographyInput,
  dispatchEntry,
  liveEntry,
  mailEntry,
  play
} from './office-choreography-test-fixtures'
import { FloorActors } from './office-floor-actors'
import { FloorBubbles } from './office-floor-bubbles'
import { WALL_CLOCK } from './office-floor-clock'
import { officeFloorPlan } from './office-floor-plan'
import type { PlacedMember } from './office-floor-roster'
import { seatAnchor, seatRoster } from './office-floor-seating'
import type { FloorActivity } from './office-floor-state'
import type { FloorStage } from './office-floor-walk-route'
import type { TeamActivityEntry } from './team-activity-merge'
import { makeTeamMember } from './team-snapshot-test-fixtures'

function placedMember(id: string, activity: FloorActivity, manager = false): PlacedMember {
  return {
    member: makeTeamMember({ id, slug: id, display_name: id, is_manager: manager ? 1 : 0 }),
    activity,
    needsYou: false,
    tool: '',
    task: undefined
  }
}

const PLACED = [
  placedMember('lead', 'idle', true),
  placedMember('ada', 'idle'),
  placedMember('bo', 'working'),
  placedMember('cy', 'idle')
]
const SEATING = seatRoster(PLACED.map(({ member }) => member))
const STAGE: FloorStage = { plan: officeFloorPlan('wide', SEATING.pods.length), seating: SEATING }
const CAST = PLACED.map(({ member, activity }) => ({
  id: member.id,
  manager: Boolean(member.is_manager),
  activity
}))

/** The scene `afterMs` after `live` arrived at time 1000. */
function sceneAfter(
  live: readonly TeamActivityEntry[],
  afterMs: number,
  reducedMotion = false
): FloorScene {
  const input = choreographyInput({ cast: CAST, live, reducedMotion })
  const frames = play(initialChoreography({ epoch: 1, live: [] }), input, 1_000, 1_000 + afterMs)
  const last = frames.at(-1)
  return last ? floorScene(last.state, last.at) : floorScene(initialChoreography(input), 0)
}

function actorsMarkup(
  scene: FloorScene,
  reducedMotion = false,
  highlighted: string[] = []
): string {
  return renderToStaticMarkup(
    <FloorActors
      stage={STAGE}
      placed={PLACED}
      choreography={{ scene, clock: WALL_CLOCK, reducedMotion }}
      highlighted={new Set(highlighted)}
    />
  )
}

function count(markup: string, needle: string): number {
  return markup.split(needle).length - 1
}

describe('floor actors', () => {
  it('draws nobody while everyone is at their desks', () => {
    const markup = actorsMarkup(sceneAfter([], 0))
    expect(markup).not.toContain('data-floor-actor')
    expect(markup).toMatch(/^<div aria-hidden="true" class="pointer-events-none /)
  })

  it('draws a walker on their feet with what they carry', () => {
    const markup = actorsMarkup(sceneAfter([mailEntry(1, 1_000, 'ada', ['cy'], 'handoff')], 300))
    expect(count(markup, 'data-floor-actor=')).toBe(1)
    expect(markup).toContain('data-floor-actor="ada"')
    expect(markup).toContain('data-pose="walking"')
    expect(markup).toContain('data-place="beside:cy"')
    expect(markup).toContain('data-carrying="folder"')
  })

  it('seats the assignees of a kickoff at the table and stands the manager at the whiteboard', () => {
    const live = [dispatchEntry(1, 1_000, 'ada'), dispatchEntry(2, 1_000, 'cy')]
    const markup = actorsMarkup(sceneAfter(live, 2_300))
    expect(count(markup, 'data-pose="sitting"')).toBe(2)
    expect(markup).toContain('data-place="conference:0"')
    expect(markup).toContain('data-place="conference:1"')
    expect(markup).toMatch(/data-floor-actor="lead" data-pose="standing" data-place="whiteboard"/)
  })

  it('marks a highlighted actor', () => {
    const scene = sceneAfter([mailEntry(1, 1_000, 'ada', ['cy'])], 300)
    expect(actorsMarkup(scene)).not.toContain('data-highlighted')
    const markup = actorsMarkup(scene, false, ['ada', 'bo'])
    expect(count(markup, 'data-highlighted="true"')).toBe(1)
    expect(markup).toContain('stroke-ring')
  })

  it('flies an envelope from a working sender, tinted by the kind of mail', () => {
    const markup = actorsMarkup(sceneAfter([mailEntry(1, 1_000, 'bo', ['ada'], 'status')], 300))
    expect(markup).not.toContain('data-floor-actor')
    expect(count(markup, 'data-floor-envelope=')).toBe(1)
    expect(markup).toContain('data-tint="status"')
    expect(markup).toContain('var(--tof-marker-blue)')
  })

  it('shows only notes and boxes when motion is reduced', () => {
    const live = [
      dispatchEntry(1, 1_000, 'ada'),
      dispatchEntry(2, 1_000, 'cy'),
      mailEntry(3, 1_000, 'bo', ['ada'], 'status'),
      mailEntry(4, 1_000, 'ada', ['cy']),
      liveEntry(5, 1_000, { kind: 'gate_opened', to: { party: 'operator', member_ids: [] } }),
      liveEntry(6, 1_000, {
        kind: 'task_settled',
        status: 'completed',
        from: { party: 'member', member_id: 'ada' }
      })
    ]
    const markup = actorsMarkup(sceneAfter(live, 3_400, true), true)
    expect(markup).not.toContain('data-floor-actor')
    expect(markup).not.toContain('data-floor-envelope')
    expect(count(markup, 'data-floor-prop="note"')).toBe(1)
    expect(count(markup, 'data-floor-prop="box"')).toBe(1)
  })

  it('never draws SVG text, which would scale with the art', () => {
    const live = [dispatchEntry(1, 1_000, 'ada'), dispatchEntry(2, 1_000, 'cy')]
    expect(actorsMarkup(sceneAfter(live, 2_300))).not.toContain('<text')
  })
})

describe('floor bubbles', () => {
  const desks = [STAGE.plan.managerDesk, ...STAGE.plan.pods.flatMap((pod) => pod.desks)].map(
    (desk) => ({
      desk,
      entry: PLACED.find(({ member }) => {
        const seat = SEATING.seats.get(member.id)
        return seat !== undefined && seatAnchor(seat) === desk.anchor
      })
    })
  )

  function bubblesMarkup(scene: FloorScene, thoughts: Record<string, string>): string {
    return renderToStaticMarkup(
      <FloorBubbles plan={STAGE.plan} desks={desks} scene={scene} thoughts={thoughts} />
    )
  }

  it('puts a thought cloud over whoever is working, and over nobody else', () => {
    const markup = bubblesMarkup(sceneAfter([], 0), {
      ada: 'Read · notes.md',
      bo: 'Edit · importer.ts',
      cy: ''
    })
    expect(count(markup, 'data-floor-thought=')).toBe(1)
    expect(markup).toContain('data-floor-thought="bo"')
    expect(markup).toContain('Edit · importer.ts')
    expect(markup).not.toContain('notes.md')
  })

  it('shows a ticket over an assignee who stayed at their desk, and "+N" over a full queue', () => {
    const recipients = ['lead', 'cy', 'bo', 'lead', 'cy']
    const live = [
      dispatchEntry(1, 1_000, 'bo'),
      ...recipients.map((to, index) => mailEntry(index + 2, 1_000, 'ada', [to]))
    ]
    const markup = bubblesMarkup(sceneAfter(live, 3_300), {})
    expect(markup).toMatch(/data-floor-badge="bo" data-kind="ticket"/)
    expect(markup).toMatch(/data-floor-overflow="ada"[^>]*>\+2</)
  })

  it('never sets type below 11px', () => {
    const live = [dispatchEntry(1, 1_000, 'bo')]
    const markup = bubblesMarkup(sceneAfter(live, 1_300), { bo: 'Edit · importer.ts' })
    const sizes = [...markup.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)].map(([, size]) =>
      Number(size)
    )
    expect(sizes.length).toBeGreaterThan(0)
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(11)
  })
})
