// @vitest-environment happy-dom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { rectContainsRect } from './office-floor-geometry'
import { OFFICE_PAINTS } from './office-floor-palette'
import { officeFloorPlan } from './office-floor-plan'
import type { FloorWork } from './office-floor-work'
import { FloorWorkArt, FloorWorkOverlay } from './office-floor-work-layers'
import { STAGING_BOX } from './office-floor-warehouse'

const { setTeamPageTab } = vi.hoisted(() => ({ setTeamPageTab: vi.fn() }))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: { setTeamPageTab: typeof setTeamPageTab }) => unknown) =>
    selector({ setTeamPageTab })
}))

const plan = officeFloorPlan('wide', 1)

function work(overrides: Partial<FloorWork> = {}): FloorWork {
  return { board: null, tickets: [], finished: 0, waiting: 0, ...overrides }
}

function count(markup: string, attribute: string): number {
  return markup.split(` ${attribute}=`).length - 1
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('FloorWorkArt', () => {
  const art = (state: FloorWork): string =>
    renderToStaticMarkup(
      <svg>
        <FloorWorkArt plan={plan} work={state} />
      </svg>
    )

  it('draws nothing while no work is finished and nothing waits', () => {
    expect(art(work())).not.toContain('<rect')
  })

  it('draws a box per finished task, twelve at most, inside the staging area', () => {
    expect(count(art(work({ finished: 5 })), 'data-staged-box')).toBe(5)
    expect(count(art(work({ finished: 12 })), 'data-staged-box')).toBe(12)
    const full = art(work({ finished: 30 }))
    expect(count(full, 'data-staged-box')).toBe(12)
    const boxes = [...full.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="12" height="9"/g)]
    expect(boxes).toHaveLength(12)
    for (const [, x, y] of boxes) {
      const box = { x: Number(x), y: Number(y), ...STAGING_BOX }
      expect(rectContainsRect(plan.fixtures.staging, box)).toBe(true)
    }
  })

  it('piles a note in the reception tray per thing waiting', () => {
    expect(count(art(work({ waiting: 1 })), 'data-reception-note')).toBe(1)
    expect(count(art(work({ waiting: 3 })), 'data-reception-note')).toBe(3)
    expect(count(art(work({ waiting: 0 })), 'data-reception-note')).toBe(0)
  })

  it('paints only with the palette, and never with text', () => {
    const svg = art(work({ finished: 12, waiting: 9 }))
    expect(svg).not.toMatch(/<text|<image|<foreignObject|#[0-9a-f]{3,8}\b|rgb\(/i)
    const paints = new Set<string>(OFFICE_PAINTS)
    const fills = [...svg.matchAll(/fill:var\(--tof-([\w-]+)\)/g)].map(([, paint]) => paint)
    expect(fills.length).toBeGreaterThan(0)
    expect(fills.every((paint) => paints.has(paint))).toBe(true)
  })
})

describe('FloorWorkOverlay', () => {
  it('opens the Inbox tab from the reception button', () => {
    const view = render(<FloorWorkOverlay plan={plan} work={work({ waiting: 3 })} />)
    const button = view.getByRole('button', { name: '3 waiting on you' })
    expect(view.container.querySelector('[data-reception-waiting="3"]')?.contains(button)).toBe(
      true
    )
    expect(setTeamPageTab).not.toHaveBeenCalled()
    fireEvent.click(button)
    expect(setTeamPageTab).toHaveBeenCalledTimes(1)
    expect(setTeamPageTab).toHaveBeenCalledWith('inbox')
  })

  it('is a real button a keyboard can reach, under an overlay that otherwise ignores the pointer', () => {
    const view = render(<FloorWorkOverlay plan={plan} work={work({ waiting: 1 })} />)
    const button = view.getByRole('button', { name: '1 waiting on you' })
    expect(button.tagName).toBe('BUTTON')
    expect(button.getAttribute('tabindex')).not.toBe('-1')
    button.focus()
    expect(document.activeElement).toBe(button)
    expect(view.container.firstElementChild?.className).toContain('pointer-events-none')
    expect(button.parentElement?.className).toContain('pointer-events-auto')
  })

  it('has no button while nothing waits', () => {
    const view = render(<FloorWorkOverlay plan={plan} work={work()} />)
    expect(view.queryByRole('button')).toBeNull()
    expect(view.container.querySelector('[data-reception-waiting]')).toBeNull()
  })

  it('shows a readable chip with the ref on each desk that has a ticket', () => {
    const tickets = [
      { memberId: 'ada', ref: 'imp-7', at: { x: 100, y: 120 } },
      { memberId: 'bo', ref: 'imp-8', at: { x: 160, y: 120 } }
    ]
    const view = render(<FloorWorkOverlay plan={plan} work={work({ tickets })} />)
    const chips = [...view.container.querySelectorAll<HTMLElement>('[data-desk-ticket]')]
    expect(chips.map((chip) => chip.textContent)).toEqual(['imp-7', 'imp-8'])
    expect(chips.map((chip) => chip.getAttribute('data-desk-ticket'))).toEqual(['imp-7', 'imp-8'])
    for (const chip of chips) {
      expect(chip.className).toContain('text-[11px]')
    }
    expect(chips[0].style.left).toBe(`${(100 / plan.width) * 100}%`)
  })

  it('writes the count beside the boxes only once the staging area is full', () => {
    const upTo = render(<FloorWorkOverlay plan={plan} work={work({ finished: 12 })} />)
    expect(upTo.container.querySelector('[data-staged-box-count]')).toBeNull()
    cleanup()
    const past = render(<FloorWorkOverlay plan={plan} work={work({ finished: 15 })} />)
    const label = past.container.querySelector('[data-staged-box-count]')
    expect(label?.getAttribute('data-staged-box-count')).toBe('15')
    expect(label?.textContent).toBe('×15')
    expect(label?.className).toContain('text-[11px]')
  })
})
