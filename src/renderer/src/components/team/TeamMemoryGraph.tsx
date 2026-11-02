import React, { useId, useMemo } from 'react'
import { translate } from '@/i18n/i18n'
import { Portrait, memberLook } from './office-floor-sprite'
import type { TeamMemoryResult } from './team-runtime-client'
import type { TeamMember } from './team-snapshot-types'

const WIDTH = 900
const HEIGHT = 560
const AGENT_RADIUS = 140
const TOPIC_RADIUS = 248

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
    graph.nodes.filter((node) => node.kind === 'agent').map((node) => node.id),
    AGENT_RADIUS,
    -Math.PI / 2
  )
  place(
    graph.nodes.filter((node) => node.kind !== 'agent').map((node) => node.id),
    TOPIC_RADIUS,
    -Math.PI / 2 + Math.PI / 7
  )
  return positions
}

function AgentNode({
  member,
  label,
  x,
  y,
  hot
}: {
  member: TeamMember | undefined
  label: string
  x: number
  y: number
  hot: boolean
}): React.JSX.Element {
  return (
    <g>
      <circle
        cx={x}
        cy={y}
        r={22}
        style={{
          fill: hot ? 'var(--bureau-accent-soft)' : 'var(--bureau-paper)',
          stroke: hot ? 'var(--bureau-accent)' : 'var(--bureau-ink)',
          strokeWidth: hot ? 3 : 2
        }}
      />
      {member ? (
        <foreignObject x={x - 17} y={y - 17} width={34} height={34}>
          <div className="flex size-[34px] items-center justify-center overflow-hidden rounded-full">
            <Portrait look={memberLook(member.slug, Boolean(member.is_manager))} size={34} />
          </div>
        </foreignObject>
      ) : (
        <text
          x={x}
          y={y + 4}
          textAnchor="middle"
          style={{ fill: 'var(--bureau-ink)', fontSize: 11, fontWeight: 600 }}
        >
          {label.slice(0, 2).toUpperCase()}
        </text>
      )}
    </g>
  )
}

export function TeamMemoryGraph({
  graph,
  highlighted,
  members
}: {
  graph: TeamMemoryResult['graph']
  highlighted: ReadonlySet<string>
  members: readonly TeamMember[]
}): React.JSX.Element {
  const positions = useMemo(() => layoutTeamMemoryGraph(graph), [graph])
  const patternId = `team-memory-dots-${useId().replaceAll(':', '')}`
  const memberFor = (node: { id: string; label: string }): TeamMember | undefined =>
    members.find((member) => member.id === node.id) ??
    members.find((member) => member.display_name === node.label)
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="h-full w-full"
      role="img"
      aria-label={translate('team.memory.graphLabel', 'Team memory graph')}
    >
      <defs>
        <pattern id={patternId} width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" style={{ fill: 'var(--bureau-rule)' }} opacity={0.5} />
        </pattern>
      </defs>
      <rect width={WIDTH} height={HEIGHT} fill={`url(#${patternId})`} />
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
            style={{ stroke: 'var(--bureau-rule)' }}
            strokeWidth={1.5}
            strokeDasharray="4 4"
          />
        ) : null
      })}
      <circle
        cx={WIDTH / 2}
        cy={HEIGHT / 2}
        r={54}
        style={{
          fill: 'var(--bureau-paper-deep)',
          stroke: 'var(--bureau-ink)',
          strokeWidth: 2,
          strokeDasharray: '5 4'
        }}
      />
      <text
        x={WIDTH / 2}
        y={HEIGHT / 2 + 4}
        textAnchor="middle"
        style={{ fill: 'var(--bureau-ink)', fontFamily: 'var(--font-pixel)', fontSize: 11 }}
      >
        {translate('team.memory.center', 'TEAM')}
      </text>
      {graph.nodes.map((node) => {
        const position = positions.get(node.id)
        if (!position) {
          return null
        }
        const hot = highlighted.has(node.id)
        const { x, y } = position
        if (node.kind === 'agent') {
          return (
            <g key={node.id}>
              <AgentNode member={memberFor(node)} label={node.label} x={x} y={y} hot={hot} />
              <text
                x={x}
                y={y + 36}
                textAnchor="middle"
                style={{ fill: 'var(--bureau-ink)', fontSize: 12, fontWeight: 600 }}
              >
                {node.label.slice(0, 20)}
              </text>
            </g>
          )
        }
        return (
          <g key={node.id}>
            {node.kind === 'note' ? (
              <circle
                cx={x}
                cy={y}
                r={9}
                style={{
                  fill: 'var(--bureau-lilac)',
                  stroke: hot ? 'var(--bureau-accent)' : 'var(--bureau-ink)',
                  strokeWidth: hot ? 3 : 1.5
                }}
              />
            ) : (
              <rect
                x={x - 9}
                y={y - 7}
                width={18}
                height={14}
                rx={2}
                style={{
                  fill: 'var(--bureau-sky)',
                  stroke: hot ? 'var(--bureau-accent)' : 'var(--bureau-ink)',
                  strokeWidth: hot ? 3 : 1.5
                }}
              />
            )}
            <text
              x={x}
              y={y + 24}
              textAnchor="middle"
              style={{ fill: 'var(--bureau-ink-soft)', fontSize: 11 }}
            >
              {node.label.slice(0, 20)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
