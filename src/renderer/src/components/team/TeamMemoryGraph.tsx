import React, { useMemo } from 'react'
import type { TeamMemoryResult } from './team-runtime-client'

const WIDTH = 520
const HEIGHT = 360

/** Ring layout: agents inner, tickets and notes outer, so ownership edges read as spokes. */
export function layoutTeamMemoryGraph(
  graph: TeamMemoryResult['graph']
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()
  const place = (ids: string[], radius: number, offset: number) => {
    ids.forEach((id, index) => {
      const angle = offset + (2 * Math.PI * index) / Math.max(ids.length, 1)
      positions.set(id, {
        x: WIDTH / 2 + radius * Math.cos(angle),
        y: HEIGHT / 2 + radius * Math.sin(angle)
      })
    })
  }
  place(
    graph.nodes.filter((n) => n.kind === 'agent').map((n) => n.id),
    70,
    0
  )
  place(
    graph.nodes.filter((n) => n.kind !== 'agent').map((n) => n.id),
    160,
    Math.PI / 7
  )
  return positions
}

export function TeamMemoryGraph({
  graph,
  highlighted
}: {
  graph: TeamMemoryResult['graph']
  highlighted: ReadonlySet<string>
}): React.JSX.Element {
  const positions = useMemo(() => layoutTeamMemoryGraph(graph), [graph])
  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-full w-full" role="img">
      {graph.edges.map((edge) => {
        const from = positions.get(edge.from)
        const to = positions.get(edge.to)
        return from && to ? (
          <line
            key={`${edge.from}-${edge.to}`}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            className="stroke-border"
            strokeWidth={1}
          />
        ) : null
      })}
      {graph.nodes.map((node) => {
        const position = positions.get(node.id)
        if (!position) {
          return null
        }
        const hot = highlighted.has(node.id)
        return (
          <g key={node.id}>
            <circle
              cx={position.x}
              cy={position.y}
              r={node.kind === 'agent' ? 9 : 6}
              className={
                hot
                  ? 'fill-foreground'
                  : node.kind === 'agent'
                    ? 'fill-muted-foreground'
                    : node.kind === 'note'
                      ? 'fill-muted'
                      : 'fill-accent'
              }
              stroke="currentColor"
              strokeOpacity={0.3}
            >
              <title>{node.label}</title>
            </circle>
            {node.kind === 'agent' || hot ? (
              <text
                x={position.x}
                y={position.y - 12}
                textAnchor="middle"
                // The viewBox is drawn at about 0.8x, so 14 units keeps the label at 11px or more.
                className="fill-foreground text-[14px]"
              >
                {node.label.slice(0, 24)}
              </text>
            ) : null}
          </g>
        )
      })}
    </svg>
  )
}
