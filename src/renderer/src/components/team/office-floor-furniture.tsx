import React from 'react'
import { Coffee } from 'lucide-react'
import { translate } from '@/i18n/i18n'

/** One room of the apartment; the parent grid's gap draws the walls between rooms. */
export function Room({
  label,
  area,
  floor = 'boards',
  children
}: {
  label: string
  area: string
  floor?: 'boards' | 'tiles'
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section
      data-floor={floor}
      data-area={area}
      className="team-office-room relative flex min-w-0 flex-col gap-3 bg-card p-4"
    >
      <div className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </div>
      {children}
    </section>
  )
}

export function Television(): React.JSX.Element {
  return (
    <div className="flex flex-col items-center gap-1" aria-hidden="true">
      <div className="h-2.5 w-44 rounded-sm bg-foreground/60" />
      <div className="h-1.5 w-56 rounded-sm border border-border bg-muted" />
    </div>
  )
}

export function CoffeeTable(): React.JSX.Element {
  return (
    <div
      data-floor-anchor="table"
      className="mx-auto h-10 w-48 rounded-md border border-border bg-muted/60"
      aria-hidden="true"
    />
  )
}

/** Three cushions and an armchair; characters sit on the anchors. */
export function Couch(): React.JSX.Element {
  const cushion = (index: number): React.ReactNode => (
    <div
      key={index}
      data-floor-anchor={`couch-${index}`}
      className="h-[72px] min-w-0 flex-1 rounded-md border border-border bg-card/80"
    />
  )
  return (
    <div className="mx-auto flex w-full max-w-lg items-end gap-3" aria-hidden="true">
      <div className="flex flex-1 gap-1 rounded-xl border border-border border-b-[10px] bg-muted p-1.5 px-3">
        {[0, 1, 2].map(cushion)}
      </div>
      <div className="flex w-[84px] rounded-xl border border-border border-b-[10px] bg-muted p-1.5">
        {cushion(3)}
      </div>
    </div>
  )
}

export function KitchenCounter(): React.JSX.Element {
  return (
    <div className="flex items-stretch gap-2" aria-hidden="true">
      <div className="flex h-10 flex-1 items-center justify-end gap-2 rounded-md border border-border bg-muted px-2.5">
        <span className="size-4 rounded-full border border-border bg-card" />
        <span className="size-4 rounded-full border border-border bg-card" />
        <Coffee className="size-4 text-muted-foreground" />
      </div>
      <div className="w-10 rounded-md border border-border bg-muted" />
    </div>
  )
}

/** Where characters stand at the counter and by the fridge. */
export function KitchenFloor(): React.JSX.Element {
  return (
    <div className="flex h-14 justify-between px-6" aria-hidden="true">
      <span data-floor-anchor="kitchen" className="w-8" />
      <span data-floor-anchor="fridge" className="w-8" />
    </div>
  )
}

export function Stools(): React.JSX.Element {
  return (
    <div className="flex flex-wrap gap-2" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          data-floor-anchor={`stool-${index}`}
          className="size-16 rounded-full border border-dashed border-border"
        />
      ))}
    </div>
  )
}

/** Scribbled equations; decorative only. */
export function Whiteboard({ variant }: { variant: 0 | 1 }): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 120 56"
      className="h-16 min-w-0 flex-1 rounded-md border-2 border-border bg-foreground/[0.03]"
      aria-hidden="true"
    >
      {variant === 0 ? (
        <g fill="none" strokeWidth={1.2} className="stroke-muted-foreground">
          <path d="M10 16 q6 -8 12 0 t12 0" />
          <path d="M40 14 h14 M47 8 v12" />
          <path d="M62 16 q10 -10 20 0" />
          <path d="M10 34 h40" />
          <path d="M56 30 l6 8 l10 -14" />
          <path d="M10 44 h24 M40 44 h30 M76 44 h26" />
        </g>
      ) : (
        <g fill="none" strokeWidth={1.2} className="stroke-muted-foreground">
          <circle cx={26} cy={24} r={12} />
          <path d="M26 12 v24 M14 24 h24" />
          <path d="M50 14 h50 M50 22 h36 M50 30 h44" />
          <path d="M14 46 q20 -10 40 0 t40 0" />
        </g>
      )}
    </svg>
  )
}

export function FrontDoor({ onAddMember }: { onAddMember: () => void }): React.JSX.Element {
  return (
    <div className="flex flex-1 flex-col justify-end gap-3">
      <svg
        viewBox="0 0 60 60"
        data-floor-anchor="door"
        className="size-14 self-start"
        aria-hidden="true"
      >
        <path d="M4 56 V8" strokeWidth={3} className="stroke-muted-foreground" />
        <path
          d="M4 8 A48 48 0 0 1 52 56"
          fill="none"
          strokeDasharray="3 3"
          className="stroke-muted-foreground"
        />
      </svg>
      <button
        type="button"
        onClick={onAddMember}
        className="rounded-md border border-dashed border-border px-3 py-2 text-left text-[12px] text-muted-foreground transition-colors outline-none hover:border-foreground/20 hover:bg-accent/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        {translate('team.floor.invite', 'Invite a member in')}
      </button>
      <span className="text-[11px] text-muted-foreground/70">
        {translate('team.floor.elevator', 'Elevator · out of order')}
      </span>
    </div>
  )
}
