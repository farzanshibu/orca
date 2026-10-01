import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SeatedCharacter, SeatedFigure } from './office-floor-character'
import { rectContainsRect, rectsOverlap } from './office-floor-geometry'
import { Kitchen } from './office-floor-kitchen'
import { OFFICE_PAINTS } from './office-floor-palette'
import {
  floorRoom,
  officeFloorPlan,
  type FloorRect,
  type FloorVariant,
  type OfficeFloorPlan
} from './office-floor-plan'
import { DeskForeground, DeskSetup, PodBlock } from './office-floor-pods'
import { CommonAreas, ConferenceRoom, ManagerOffice, Reception } from './office-floor-rooms'
import { OfficeBackdrop } from './office-floor-scene'
import { OfficeShell, OfficeWalls } from './office-floor-shell'
import { memberLook } from './office-floor-sprite'
import { STAGING_BOX, Warehouse, stagingBoxSpots } from './office-floor-warehouse'

const VARIANTS: readonly FloorVariant[] = ['narrow', 'medium', 'wide']
const POD_COUNTS = [1, 2, 3, 5, 9]
const LOOK = memberLook('ada', false)

function eachPlan(check: (plan: OfficeFloorPlan, label: string) => void): void {
  for (const variant of VARIANTS) {
    for (const pods of POD_COUNTS) {
      check(officeFloorPlan(variant, pods), `${variant} with ${pods} pod(s)`)
    }
  }
}

function markup(art: React.ReactNode): string {
  return renderToStaticMarkup(<svg>{art}</svg>)
}

type Drawn = FloorRect & { paint: string | undefined }

/** Every art pixel run in a piece of markup. A pattern tile's runs are in tile space, so they are left out. */
function drawn(svg: string): Drawn[] {
  const placed = svg.replace(/<defs>[\s\S]*?<\/defs>/g, '')
  return [...placed.matchAll(/<rect ([^>]*)>/g)].map(([, attributes]) => {
    const number = (name: string): number =>
      Number(new RegExp(` ${name}="(-?[\\d.]+)"`).exec(` ${attributes}`)?.[1])
    return {
      x: number('x'),
      y: number('y'),
      w: number('width'),
      h: number('height'),
      paint: /fill:var\(--tof-([\w-]+)\)/.exec(attributes)?.[1]
    }
  })
}

function rooms(plan: OfficeFloorPlan): Record<string, React.JSX.Element> {
  return {
    shell: <OfficeShell plan={plan} />,
    walls: <OfficeWalls plan={plan} />,
    manager: <ManagerOffice plan={plan} />,
    conference: <ConferenceRoom plan={plan} whiteboardBlank={false} />,
    kitchen: <Kitchen plan={plan} />,
    reception: <Reception plan={plan} />,
    commonAreas: <CommonAreas plan={plan} />,
    warehouse: <Warehouse plan={plan} />
  }
}

describe('office floor room art', () => {
  it('draws every room on narrow, medium and wide floors, inside the building', () => {
    eachPlan((plan, label) => {
      const floor = { x: 0, y: 0, w: plan.width, h: plan.height }
      for (const [name, art] of Object.entries(rooms(plan))) {
        const runs = drawn(markup(art))
        // Only a floor with every pod slot taken has no common area to dress.
        if (name !== 'commonAreas' || plan.vacantSlots.length > 0) {
          expect(runs.length, `${label}: ${name}`).toBeGreaterThan(0)
        }
        for (const run of runs) {
          expect(run.w > 0 && run.h > 0, `${label}: ${name} ${JSON.stringify(run)}`).toBe(true)
          expect(rectContainsRect(floor, run), `${label}: ${name} ${JSON.stringify(run)}`).toBe(
            true
          )
        }
      }
    })
  })

  it('keeps each room’s furniture in that room or on the wall behind it', () => {
    eachPlan((plan, label) => {
      const furnished = {
        manager: <ManagerOffice plan={plan} />,
        kitchen: <Kitchen plan={plan} />,
        warehouse: <Warehouse plan={plan} />
      } as const
      for (const id of ['manager', 'kitchen', 'warehouse'] as const) {
        const room = floorRoom(plan, id)?.rect
        for (const run of drawn(markup(furnished[id]))) {
          const sideways = room && run.x >= room.x && run.x + run.w <= room.x + room.w
          expect(sideways, `${label}: ${id} ${JSON.stringify(run)}`).toBe(true)
        }
      }
    })
  })

  it('composes the whole backdrop, with the scribbles only on a board nobody is writing on', () => {
    eachPlan((plan, label) => {
      const scribbled = drawn(markup(<OfficeBackdrop plan={plan} whiteboardBlank={false} />))
      const blank = drawn(markup(<OfficeBackdrop plan={plan} whiteboardBlank />))
      expect(blank.length, label).toBeGreaterThan(0)
      expect(scribbled.length, label).toBeGreaterThan(blank.length)
      const board = plan.fixtures.whiteboard
      const marker = (runs: readonly Drawn[]): Drawn[] =>
        runs.filter((run) => run.paint?.startsWith('marker-') && rectContainsRect(board, run))
      expect(marker(scribbled).length, label).toBeGreaterThan(0)
      expect(marker(blank), label).toEqual([])
    })
  })

  it('paints only with the palette, and never with text or images', () => {
    const paints = new Set<string>(OFFICE_PAINTS)
    eachPlan((plan, label) => {
      const svg = markup(
        <>
          <OfficeBackdrop plan={plan} whiteboardBlank={false} />
          {plan.pods[0].desks.map((desk) => (
            <DeskSetup key={desk.anchor} desk={desk} state="working" occupied={false} />
          ))}
        </>
      )
      expect(svg, label).not.toMatch(/<text|<image|<foreignObject|#[0-9a-f]{3,8}\b|rgb\(/i)
      const fills = [...svg.matchAll(/fill:([^;"]+)/g)].map(([, fill]) => fill)
      expect(fills.length, label).toBeGreaterThan(0)
      for (const fill of fills) {
        const paint = /^var\(--tof-([\w-]+)\)$/.exec(fill)?.[1]
        expect(paint !== undefined && paints.has(paint), `${label}: ${fill}`).toBe(true)
      }
    })
  })
})

describe('office floor pod art', () => {
  it('draws a pod’s shared block between its two rows', () => {
    eachPlan((plan, label) => {
      for (const pod of plan.pods) {
        const runs = drawn(markup(<PodBlock pod={pod} />))
        expect(runs.length, label).toBeGreaterThan(0)
        const [back, , front] = pod.desks
        for (const run of runs) {
          expect(rectContainsRect(pod.rect, run), `${label}: pod ${pod.index}`).toBe(true)
          // The block starts at one row's seats and ends, shadow included, short of the other's.
          expect(run.y, label).toBeGreaterThanOrEqual(back.seat.y)
          expect(run.y + run.h, label).toBeLessThanOrEqual(front.top.y + front.top.h + 2)
        }
      }
    })
  })

  it('shows a monitor’s back to the viewer on one row and its screen on the other', () => {
    const [viewer, , away] = officeFloorPlan('wide', 1).pods[0].desks
    const lit = (desk: typeof viewer): string[] =>
      drawn(markup(<DeskSetup desk={desk} state="working" occupied />)).flatMap(({ paint }) =>
        paint ? [paint] : []
      )
    expect(lit(away)).toContain('screen-line')
    expect(lit(viewer)).not.toContain('screen-line')
    // The back of a working monitor still glows, so a viewer-facing desk is not mute.
    expect(lit(viewer)).toContain('screen-work')
    const dark = drawn(markup(<DeskSetup desk={viewer} state="off" occupied />))
    expect(dark.map(({ paint }) => paint)).not.toContain('screen-work')
  })

  it('draws a chair at every desk, and its cushion only while nobody sits there', () => {
    eachPlan((plan, label) => {
      for (const desk of [plan.managerDesk, ...plan.pods.flatMap((pod) => pod.desks)]) {
        const name = `${label}: ${desk.anchor}`
        const paintsOf = (occupied: boolean): (string | undefined)[] =>
          drawn(markup(<DeskSetup desk={desk} state="idle" occupied={occupied} />)).map(
            ({ paint }) => paint
          )
        expect(paintsOf(false), name).toContain('chair-dark')
        expect(paintsOf(true), name).not.toContain('chair-dark')
        // A screen stands a little above its desk's edge; everything else is within the cell.
        const reach = { ...desk.cell, y: desk.cell.y - 4, h: desk.cell.h + 4 }
        for (const run of drawn(markup(<DeskSetup desk={desk} state="idle" occupied={false} />))) {
          expect(rectContainsRect(reach, run), `${name} ${JSON.stringify(run)}`).toBe(true)
        }
      }
    })
  })

  it('puts a viewer-facing sitter behind their monitor and an away-facing one behind their chair', () => {
    const [viewer, , away] = officeFloorPlan('medium', 1).pods[0].desks
    expect(markup(<DeskForeground desk={viewer} state="idle" />)).toContain('<rect')
    expect(markup(<DeskForeground desk={away} state="idle" />)).not.toContain('<rect')
    const facing = markup(<SeatedCharacter desk={viewer} look={LOOK} screen="working" />)
    const turned = markup(<SeatedCharacter desk={away} look={LOOK} screen="working" />)
    // A face has a mouth; a back does not.
    expect(facing).toContain('--tof-mouth')
    expect(turned).not.toContain('--tof-mouth')
    expect(turned).toContain('--tof-chair')
    expect(facing.lastIndexOf('--tof-metal-dark')).toBeGreaterThan(facing.indexOf('--tof-mouth'))
  })

  it('seats a figure at any seat anchor, facing the way the anchor says', () => {
    const plan = officeFloorPlan('wide', 1)
    for (const anchor of plan.anchors.filter((candidate) => candidate.seated)) {
      const figure = markup(<SeatedFigure at={anchor.point} facing={anchor.facing} look={LOOK} />)
      expect(figure.includes('--tof-mouth'), anchor.id).toBe(anchor.facing === 'viewer')
    }
  })
})

describe('office floor warehouse art', () => {
  it('keeps the staging area inside the warehouse and draws nothing in it but its outline', () => {
    eachPlan((plan, label) => {
      const warehouse = floorRoom(plan, 'warehouse')?.rect
      const { staging } = plan.fixtures
      expect(warehouse && rectContainsRect(warehouse, staging), label).toBe(true)
      const inside = { x: staging.x + 1, y: staging.y + 1, w: staging.w - 2, h: staging.h - 2 }
      const runs = drawn(markup(<Warehouse plan={plan} />))
      expect(
        runs.filter((run) => rectsOverlap(run, inside)),
        label
      ).toEqual([])
      const outline = runs.filter((run) => rectsOverlap(run, staging))
      expect(outline.length, label).toBeGreaterThan(0)
      expect(
        outline.every(({ paint }) => paint === 'marking'),
        label
      ).toBe(true)
    })
  })

  it('stacks a dozen boxes in the staging area, floor layer first, without overlap', () => {
    eachPlan((plan, label) => {
      const { staging } = plan.fixtures
      const boxes = stagingBoxSpots(staging).map((spot) => ({ ...spot, ...STAGING_BOX }))
      expect(boxes, label).toHaveLength(12)
      boxes.forEach((box, index) => {
        expect(rectContainsRect(staging, box), `${label}: box ${index}`).toBe(true)
        for (const other of boxes.slice(index + 1)) {
          expect(rectsOverlap(box, other), `${label}: box ${index}`).toBe(false)
        }
      })
      const floorLayer = boxes.slice(0, boxes.length / 2)
      const top = boxes.slice(boxes.length / 2)
      expect(new Set(floorLayer.map((box) => box.y)).size, label).toBe(1)
      // Each box of the second layer rests on the box under it.
      expect(
        top.map((box) => ({ x: box.x, y: box.y + STAGING_BOX.h })),
        label
      ).toEqual(floorLayer.map(({ x, y }) => ({ x, y })))
    })
  })
})
