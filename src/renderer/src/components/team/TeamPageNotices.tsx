import React, { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'

// Local loads finish well inside this, so only a slow link ever shows the line.
const LOADING_LINE_DELAY_MS = 400

/** Shown while refreshes fail. Quiet on purpose: the page keeps what it last received. */
export function TeamConnectionLine({ message }: { message: string }): React.JSX.Element {
  return (
    <p role="status" className="flex gap-2 px-3 pb-2 text-[12px] text-muted-foreground md:px-5">
      <span className="shrink-0">{translate('team.page.reconnecting', 'Reconnecting…')}</span>
      <span className="min-w-0 truncate">{message}</span>
    </p>
  )
}

/** A failed action, kept until the user dismisses it. */
export function TeamActionError({
  message,
  onDismiss
}: {
  message: string
  onDismiss: () => void
}): React.JSX.Element {
  return (
    <div
      role="alert"
      className="mx-3 mb-2 flex items-start gap-2 rounded-md border border-destructive/40 py-1.5 pr-1.5 pl-3 text-[13px] text-destructive md:mx-5"
    >
      <span className="min-w-0 flex-1 py-0.5 break-words">{message}</span>
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label={translate('team.page.dismissError', 'Dismiss')}
        onClick={onDismiss}
      >
        <X />
      </Button>
    </div>
  )
}

/** Mounted only while a team loads, so unmounting is what resets the delay. */
export function TeamLoadingLine(): React.JSX.Element {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), LOADING_LINE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [])
  return (
    <p aria-busy="true" className="px-3 text-[14px] text-muted-foreground md:px-5">
      {visible ? translate('team.page.loading', 'Loading team…') : null}
    </p>
  )
}
