import React from 'react'
import type { FloorRect } from './office-floor-plan'
import { Px } from './office-floor-sprite'

/** Loose furniture and decoration the rooms share. Each takes its top-left corner. */

export function Plant({ x, y }: { x: number; y: number }): React.JSX.Element {
  return (
    <g>
      <Px x={x + 1} y={y} w={8} h={7} c="ink" />
      <Px x={x + 2} y={y + 1} w={6} h={5} c="plant" />
      <Px x={x} y={y + 3} w={3} h={3} c="plant-dark" />
      <Px x={x + 7} y={y + 3} w={3} h={3} c="plant-dark" />
      <Px x={x + 2} y={y + 7} w={6} h={6} c="ink" />
      <Px x={x + 3} y={y + 7} w={4} h={5} c="pot" />
    </g>
  )
}

/** A floor plant with fronds; 12 wide, 22 tall. */
export function TallPlant({ x, y }: { x: number; y: number }): React.JSX.Element {
  return (
    <g>
      <Px x={x + 3} y={y} w={6} h={4} c="ink" />
      <Px x={x + 1} y={y + 3} w={10} h={9} c="ink" />
      <Px x={x + 4} y={y + 1} w={4} h={3} c="plant" />
      <Px x={x + 2} y={y + 4} w={8} h={7} c="plant" />
      <Px x={x + 2} y={y + 7} w={2} h={4} c="plant-dark" />
      <Px x={x + 8} y={y + 5} w={2} h={5} c="plant-dark" />
      <Px x={x + 5} y={y + 6} w={2} h={6} c="plant-dark" />
      <Px x={x + 5} y={y + 12} w={2} h={3} c="ink" />
      <Px x={x + 2} y={y + 14} w={8} h={8} c="ink" />
      <Px x={x + 3} y={y + 15} w={6} h={6} c="pot" />
      <Px x={x + 3} y={y + 15} w={6} h={1} c="wood-light" />
    </g>
  )
}

/** A rug with a border; drawn under whatever stands on it. */
export function Rug({ rect }: { rect: FloorRect }): React.JSX.Element {
  const { x, y, w, h } = rect
  return (
    <g>
      <Px x={x} y={y} w={w} h={h} c="rug" />
      <Px x={x + 2} y={y + 2} w={w - 4} h={h - 4} c="rug-inner" />
      <Px x={x + 4} y={y + 4} w={w - 8} h={h - 8} c="rug" />
    </g>
  )
}

/** A three-seat couch seen from the front; 68 wide, 22 tall. */
export function Couch({ x, y }: { x: number; y: number }): React.JSX.Element {
  return (
    <g>
      <Px x={x + 2} y={y + 22} w={64} h={2} c="shadow" />
      <Px x={x} y={y} w={68} h={22} c="ink" />
      <Px x={x + 1} y={y + 1} w={66} h={8} c="fabric-dark" />
      <Px x={x + 1} y={y + 9} w={66} h={12} c="fabric" />
      <Px x={x + 1} y={y + 5} w={5} h={16} c="fabric-dark" />
      <Px x={x + 62} y={y + 5} w={5} h={16} c="fabric-dark" />
      <Px x={x + 25} y={y + 9} w={1} h={12} c="fabric-dark" />
      <Px x={x + 43} y={y + 9} w={1} h={12} c="fabric-dark" />
    </g>
  )
}

/** A low table with a magazine on it; 26 wide, 12 tall. */
export function CoffeeTable({ x, y }: { x: number; y: number }): React.JSX.Element {
  return (
    <g>
      <Px x={x + 2} y={y + 12} w={22} h={2} c="shadow" />
      <Px x={x} y={y} w={26} h={12} c="ink" />
      <Px x={x + 1} y={y + 1} w={24} h={8} c="wood-light" />
      <Px x={x + 1} y={y + 9} w={24} h={2} c="wood-dark" />
      <Px x={x + 5} y={y + 3} w={8} h={5} c="paper" />
      <Px x={x + 6} y={y + 4} w={6} h={1} c="marker-blue" />
    </g>
  )
}

/** A games table with a net; 44 wide, 24 tall. */
export function GamesTable({ x, y }: { x: number; y: number }): React.JSX.Element {
  const w = 44
  const h = 24
  return (
    <g>
      <Px x={x + 2} y={y + h} w={w - 4} h={2} c="shadow" />
      <Px x={x} y={y} w={w} h={h} c="ink" />
      <Px x={x + 1} y={y + 1} w={w - 2} h={h - 2} c="table-green" />
      <Px x={x + 1} y={y + h / 2} w={w - 2} h={1} c="paper" />
      <Px x={x + w / 2} y={y - 2} w={1} h={h + 4} c="paper" />
      <Px x={x + 8} y={y + 6} w={2} h={2} c="paper" />
      <Px x={x + 31} y={y + 15} w={4} h={3} c="marker-red" />
    </g>
  )
}

/** A beanbag; 16 wide, 12 tall. */
export function Beanbag({ x, y }: { x: number; y: number }): React.JSX.Element {
  return (
    <g>
      <Px x={x + 2} y={y} w={12} h={12} c="ink" />
      <Px x={x} y={y + 4} w={16} h={8} c="ink" />
      <Px x={x + 3} y={y + 1} w={10} h={10} c="fabric" />
      <Px x={x + 1} y={y + 5} w={14} h={6} c="fabric" />
      <Px x={x + 4} y={y + 2} w={5} h={2} c="fabric-dark" />
    </g>
  )
}

/** A floor-standing copier with a paper tray; 24 wide, 22 tall. */
export function Copier({ x, y }: { x: number; y: number }): React.JSX.Element {
  return (
    <g>
      <Px x={x + 2} y={y + 22} w={20} h={2} c="shadow" />
      <Px x={x} y={y} w={24} h={22} c="ink" />
      <Px x={x + 1} y={y + 1} w={22} h={6} c="metal" />
      <Px x={x + 1} y={y + 7} w={22} h={14} c="fridge" />
      <Px x={x + 3} y={y + 2} w={10} h={3} c="metal-dark" />
      <Px x={x + 17} y={y + 3} w={2} h={2} c="marker-green" />
      <Px x={x + 3} y={y + 11} w={18} h={1} c="ink" />
      <Px x={x + 3} y={y + 16} w={18} h={1} c="ink" />
      <Px x={x + 24} y={y + 8} w={5} h={2} c="ink" />
      <Px x={x + 24} y={y + 7} w={4} h={1} c="paper" />
    </g>
  )
}

/** A filing cabinet seen from the front; 14 wide, 20 tall. */
export function FilingCabinet({ x, y }: { x: number; y: number }): React.JSX.Element {
  return (
    <g>
      <Px x={x} y={y} w={14} h={20} c="ink" />
      <Px x={x + 1} y={y + 1} w={12} h={3} c="metal" />
      <Px x={x + 1} y={y + 4} w={12} h={15} c="metal-dark" />
      <Px x={x + 1} y={y + 9} w={12} h={1} c="ink" />
      <Px x={x + 1} y={y + 14} w={12} h={1} c="ink" />
      <Px x={x + 5} y={y + 6} w={4} h={1} c="metal" />
      <Px x={x + 5} y={y + 11} w={4} h={1} c="metal" />
      <Px x={x + 5} y={y + 16} w={4} h={1} c="metal" />
    </g>
  )
}

/** A water cooler; 10 wide, 22 tall. */
export function WaterCooler({ x, y }: { x: number; y: number }): React.JSX.Element {
  return (
    <g>
      <Px x={x + 1} y={y} w={8} h={9} c="ink" />
      <Px x={x + 2} y={y + 1} w={6} h={7} c="glass-pane" />
      <Px x={x + 2} y={y + 1} w={2} h={3} c="sky-glint" />
      <Px x={x} y={y + 8} w={10} h={14} c="ink" />
      <Px x={x + 1} y={y + 9} w={8} h={12} c="fridge" />
      <Px x={x + 3} y={y + 11} w={1} h={2} c="marker-blue" />
      <Px x={x + 6} y={y + 11} w={1} h={2} c="marker-red" />
      <Px x={x + 2} y={y + 15} w={6} h={1} c="metal" />
    </g>
  )
}

/** A framed sheet on a wall; 12 wide, 10 tall. */
export function WallFrame({ x, y }: { x: number; y: number }): React.JSX.Element {
  return (
    <g>
      <Px x={x} y={y} w={12} h={10} c="ink" />
      <Px x={x + 1} y={y + 1} w={10} h={8} c="paper" />
      <Px x={x + 3} y={y + 3} w={6} h={1} c="marker-blue" />
      <Px x={x + 3} y={y + 5} w={4} h={1} c="paper-line" />
    </g>
  )
}

/** A wall clock; 9 wide, 9 tall. */
export function WallClock({ x, y }: { x: number; y: number }): React.JSX.Element {
  return (
    <g>
      <Px x={x + 2} y={y} w={5} h={9} c="ink" />
      <Px x={x} y={y + 2} w={9} h={5} c="ink" />
      <Px x={x + 1} y={y + 1} w={7} h={7} c="ink" />
      <Px x={x + 2} y={y + 2} w={5} h={5} c="paper" />
      <Px x={x + 4} y={y + 2} w={1} h={3} c="ink" />
      <Px x={x + 4} y={y + 4} w={2} h={1} c="marker-red" />
    </g>
  )
}
