import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import { TeamHireTemplateSchema, type TeamHireTemplate } from '../../../../shared/team-capabilities'

/** Parses pasted JSON into a hire template, or explains why it is not one. */
export function parseHireTemplateText(
  text: string
): { ok: true; template: TeamHireTemplate } | { ok: false; reason: string } {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, reason: translate('team.import.notJson', 'That is not valid JSON.') }
  }
  const parsed = TeamHireTemplateSchema.safeParse(raw)
  return parsed.success
    ? { ok: true, template: parsed.data }
    : {
        ok: false,
        reason:
          parsed.error.issues[0]?.message ?? translate('team.import.invalid', 'Invalid template.')
      }
}

export function TeamTemplateImportDialog({
  open,
  onOpenChange,
  onImport
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImport: (template: TeamHireTemplate) => Promise<boolean>
}): React.JSX.Element {
  const [text, setText] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{translate('team.import.title', 'Hire from a template')}</DialogTitle>
          <DialogDescription>
            {translate(
              'team.import.description',
              'Paste a member template someone shared with you.'
            )}
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="min-h-40"
          placeholder={translate('team.import.placeholder', '{"spec": "orca/team-hire@1", …}')}
        />
        {problem ? <p className="text-[12px] text-destructive">{problem}</p> : null}
        <DialogFooter>
          <Button
            disabled={!text.trim()}
            onClick={() => {
              const result = parseHireTemplateText(text)
              if (!result.ok) {
                setProblem(result.reason)
                return
              }
              setProblem(null)
              void onImport(result.template).then((ok) => ok && setText(''))
            }}
          >
            {translate('team.import.submit', 'Add member')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
