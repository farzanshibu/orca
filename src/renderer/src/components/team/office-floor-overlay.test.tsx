import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FloorOverlay } from './office-floor-overlay'
import { officeFloorPlan } from './office-floor-plan'
import { pointPlacement, rectPlacement, widthPlacement } from './office-floor-placement'

const plan = officeFloorPlan('wide', 1)

function overlayMarkup(whiteboard?: React.ReactNode): string {
  return renderToStaticMarkup(
    <FloorOverlay
      plan={plan}
      teamName="Platform"
      whiteboard={whiteboard}
      nameplates={[
        { id: 'a', at: { x: 288, y: 176 }, width: 64, name: 'Ada', dim: false },
        {
          id: 'b',
          at: { x: 352, y: 176 },
          width: 64,
          name: 'Bo',
          status: 'No recent update',
          dim: true
        }
      ]}
      badges={[{ id: 'a', at: { x: 300, y: 150 }, kind: 'question' }]}
    />
  )
}

describe('office floor overlay', () => {
  it('places things as a share of the floor, so they track the art at any scale', () => {
    const floor = { width: 400, height: 200 }
    expect(rectPlacement(floor, { x: 100, y: 50, w: 40, h: 20 })).toEqual({
      left: '25%',
      top: '25%',
      width: '10%',
      height: '10%'
    })
    expect(pointPlacement(floor, { x: 200, y: 150 })).toEqual({ left: '50%', top: '75%' })
    expect(widthPlacement(floor, 100)).toBe('25%')
  })

  it('writes the team name on the reception sign and a name under each desk', () => {
    const markup = overlayMarkup()
    expect(markup).toContain('Platform')
    expect(markup).toContain('Ada')
    expect(markup).toContain('No recent update')
    expect(markup).toContain(`left:${(256 / plan.width) * 100}%`)
    expect(markup).toContain('data-dim="true"')
  })

  it('never sets type below 11px, and never as SVG text that would scale with the art', () => {
    const markup = overlayMarkup('Ship the importer')
    const sizes = [...markup.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)].map(([, size]) =>
      Number(size)
    )
    expect(sizes.length).toBeGreaterThan(0)
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(11)
    expect(markup).not.toContain('<text')
  })

  it('leaves the whiteboard to its scribbles until something is written on it', () => {
    const board = `left:${(plan.fixtures.whiteboard.x / plan.width) * 100}%`
    expect(overlayMarkup()).not.toContain(board)
    expect(overlayMarkup('Ship the importer')).toContain(board)
    expect(overlayMarkup('Ship the importer')).toContain('Ship the importer')
  })

  it('stays out of the pointer’s way', () => {
    expect(overlayMarkup()).toMatch(/^<div class="pointer-events-none /)
  })
})
