import React, { useEffect, useRef, useState } from 'react'
import { translate } from '@/i18n/i18n'
import { AgentQuestionIcon } from '@/components/AgentQuestionIcon'
import type { FloorActivity } from './office-floor-state'
import { stableHash } from './office-floor-roaming'

const WALK_MS = 2_400
const SHIRTS = ['team-shirt-0', 'team-shirt-1', 'team-shirt-2', 'team-shirt-3', 'team-shirt-4']
const HAIRS = ['team-hair-dark', 'team-hair-brown', 'team-hair-fair']
export const CHARACTER_LOOKS = 5

/** Original sitcom-style cast; the look is stable per member so a character is recognisable. */
function Figure({ look, shirt, hair }: { look: number; shirt: string; hair: string }) {
  return (
    <svg viewBox="0 0 32 52" width={32} height={52} aria-hidden="true">
      {look === 2 ? <path d="M7 12 Q7 3 16 3 Q25 3 25 12 L26 27 L6 27 Z" className={hair} /> : null}
      <rect x={10} y={38} width={5} height={11} rx={1.5} className="team-pants" />
      <rect x={17} y={38} width={5} height={11} rx={1.5} className="team-pants" />
      <rect x={8.5} y={48} width={7} height={3} rx={1.5} className="team-ink" />
      <rect x={16.5} y={48} width={7} height={3} rx={1.5} className="team-ink" />
      <rect x={3} y={23} width={5} height={13} rx={2.5} className={shirt} />
      <rect x={24} y={23} width={5} height={13} rx={2.5} className={shirt} />
      <circle cx={5.5} cy={37} r={2} className="team-skin" />
      <circle cx={26.5} cy={37} r={2} className="team-skin" />
      <rect x={6.5} y={21} width={19} height={19} rx={4} className={shirt} />
      {look === 0 ? (
        <path d="M16 26 l-3 5 h3 l-1 4 l4 -6 h-3 l1 -3 Z" className="fill-card" />
      ) : null}
      {look === 1 ? <path d="M13 22 v6 M19 22 v6" strokeWidth={1} className="stroke-card" /> : null}
      <rect x={13} y={17} width={6} height={5} className="team-skin" />
      {look === 3 ? <rect x={11} y={17} width={10} height={6} rx={2} className={shirt} /> : null}
      <circle cx={16} cy={12} r={8} className="team-skin" />
      <circle cx={13} cy={12} r={1} className="team-ink" />
      <circle cx={19} cy={12} r={1} className="team-ink" />
      <path d="M13.5 16 q2.5 1.8 5 0" fill="none" strokeWidth={0.9} className="stroke-current" />
      {look === 0 ? <path d="M8 11 Q8 3 16 3 Q24 3 24 11 Q20 6 8 11 Z" className={hair} /> : null}
      {look === 1 ? (
        <g className={hair}>
          <circle cx={10} cy={7} r={3.2} />
          <circle cx={14.5} cy={4.5} r={3.4} />
          <circle cx={19.5} cy={5} r={3.4} />
          <circle cx={23} cy={8.5} r={2.8} />
        </g>
      ) : null}
      {look === 2 ? <path d="M8 12 Q9 4 16 4 Q23 4 24 12 Q17 7 8 12 Z" className={hair} /> : null}
      {look === 3 ? (
        <path d="M7.5 13 Q7 3.5 16 3.5 Q25 3.5 24.5 13 L24.5 10 H7.5 Z" className={hair} />
      ) : null}
      {look === 4 ? (
        <path d="M9 13 Q10 21 16 21 Q22 21 23 13 Q20 17 16 17 Q12 17 9 13 Z" className={hair} />
      ) : null}
      {look === 1 || look === 4 ? (
        <g fill="none" strokeWidth={1} className="team-ink-stroke">
          <rect x={10} y={9.5} width={5} height={4} rx={1} />
          <rect x={17} y={9.5} width={5} height={4} rx={1} />
          <path d="M15 11 h2" />
        </g>
      ) : null}
    </svg>
  )
}

export function FloorCharacter({
  id,
  slug,
  name,
  activity,
  seated,
  x,
  y,
  onOpenRoom
}: {
  id: string
  slug: string
  name: string
  activity: FloorActivity
  seated: boolean
  x: number
  y: number
  onOpenRoom: (memberId: string) => void
}): React.JSX.Element {
  const [moving, setMoving] = useState(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  useEffect(() => {
    const previous = last.current
    last.current = { x, y }
    if (!previous || (previous.x === x && previous.y === y)) {
      return undefined
    }
    setMoving(true)
    const timer = window.setTimeout(() => setMoving(false), WALK_MS)
    return () => window.clearTimeout(timer)
  }, [x, y])
  const hash = stableHash(slug)
  const look = hash % CHARACTER_LOOKS
  return (
    <button
      type="button"
      data-moving={moving ? 'true' : undefined}
      data-activity={activity}
      onClick={() => onOpenRoom(id)}
      aria-label={name}
      title={name}
      className="team-character pointer-events-auto absolute top-0 left-0 flex flex-col items-center text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring data-[activity=off]:opacity-50"
      style={{ transform: `translate(${x - 16}px, ${y - 52}px)` }}
    >
      {activity === 'waiting' ? (
        <span className="absolute -top-5 flex size-5 items-center justify-center rounded-full border border-border bg-popover">
          <AgentQuestionIcon className="size-3.5" />
        </span>
      ) : null}
      {activity === 'off' ? (
        <span className="absolute -top-3 right-0 animate-pulse text-[11px] text-muted-foreground">
          {translate('team.floor.sleeping', 'z z')}
        </span>
      ) : null}
      <Figure
        look={look}
        shirt={SHIRTS[(hash >> 3) % SHIRTS.length]}
        hair={HAIRS[(hash >> 5) % HAIRS.length]}
      />
      {seated ? null : (
        <span className="absolute top-full mt-0.5 max-w-20 truncate rounded-sm bg-popover/90 px-1 text-[11px] leading-4 text-muted-foreground">
          {name}
        </span>
      )}
    </button>
  )
}
