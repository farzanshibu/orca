import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'
import type { TeamMember } from './team-snapshot-types'

/** Dollar and token ceilings for one member. Saving applies the next time it starts. */
export function TeamMemberCapEditor({
  member,
  busy,
  onSave
}: {
  member: TeamMember
  busy: boolean
  onSave: (capUsd: number | null, tokenCap: number | null) => Promise<boolean>
}): React.JSX.Element {
  const [value, setValue] = useState(member.spend_cap_usd?.toString() ?? '')
  const [tokens, setTokens] = useState(member.token_cap?.toString() ?? '')
  const parsed = value.trim() === '' ? null : Number(value)
  const parsedTokens = tokens.trim() === '' ? null : Number(tokens)
  const valid =
    (parsed === null || (Number.isFinite(parsed) && parsed >= 0)) &&
    (parsedTokens === null || (Number.isInteger(parsedTokens) && parsedTokens > 0))
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        inputMode="decimal"
        aria-label={translate('team.orchestrator.capUsd', 'Dollar cap')}
        placeholder={translate('team.orchestrator.noCap', 'No $ cap')}
        className="h-7 w-24"
      />
      <Input
        value={tokens}
        onChange={(event) => setTokens(event.target.value)}
        inputMode="numeric"
        aria-label={translate('team.orchestrator.capTokens', 'Token cap')}
        placeholder={translate('team.orchestrator.noTokenCap', 'No token cap')}
        className="h-7 w-28"
      />
      <Button
        size="xs"
        variant="secondary"
        disabled={busy || !valid}
        onClick={() => void onSave(parsed, parsedTokens)}
      >
        {translate('team.orchestrator.setCap', 'Set cap')}
      </Button>
    </div>
  )
}
