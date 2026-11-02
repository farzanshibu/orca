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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { AGENT_CATALOG } from '@/lib/agent-catalog'
import {
  EMPTY_TEAM_MEMBER_CAPABILITIES,
  TEAM_ROLE_BUNDLES,
  type TeamMemberCapabilities
} from '../../../../shared/team-capabilities'
import { translate } from '@/i18n/i18n'
import { toTeamSlug } from '../../../../shared/team-slug'
import type { TeamMemberDraft } from './team-runtime-client'
import type { TeamMember } from './team-snapshot-types'

function Field({
  label,
  htmlFor,
  children
}: {
  label: string
  htmlFor: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="space-y-1">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}

export function TeamCreateDialog({
  open,
  repoName,
  busy,
  onOpenChange,
  onCreate
}: {
  open: boolean
  repoName: string | null
  busy: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (name: string, charter: string) => Promise<boolean>
}): React.JSX.Element {
  const [name, setName] = useState('')
  const [charter, setCharter] = useState('')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{translate('team.create.title', 'New team')}</DialogTitle>
          <DialogDescription>
            {translate('team.create.description', 'A standing team of agents for {{repo}}.', {
              repo: repoName ?? ''
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label={translate('team.create.name', 'Name')} htmlFor="team-name">
            <Input id="team-name" value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label={translate('team.create.charter', 'Charter')} htmlFor="team-charter">
            <Textarea
              id="team-charter"
              value={charter}
              onChange={(event) => setCharter(event.target.value)}
              placeholder={translate('team.create.charterPlaceholder', 'What this team is for')}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button
            disabled={busy || !name.trim()}
            onClick={() =>
              void onCreate(name, charter).then((ok) => {
                if (ok) {
                  setName('')
                  setCharter('')
                }
              })
            }
          >
            {translate('team.create.submit', 'Create team')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function TeamMemberDialog({
  open,
  hasManager,
  initial,
  editing,
  busy,
  onOpenChange,
  onSubmit
}: {
  open: boolean
  hasManager: boolean
  /** Prefills the form, as a role bundle does. Ignored while `editing`. */
  initial?: Partial<TeamMemberDraft>
  /** The member being edited, which changes the title, the fields and what a submit means. */
  editing?: TeamMember
  busy: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (draft: TeamMemberDraft) => Promise<boolean>
}): React.JSX.Element {
  const [displayName, setDisplayName] = useState(
    editing?.display_name ?? initial?.displayName ?? ''
  )
  const [role, setRole] = useState(editing?.role_slug ?? initial?.role ?? '')
  const [brief, setBrief] = useState(editing?.role_brief ?? initial?.brief ?? '')
  const [agent, setAgent] = useState(editing?.agent ?? initial?.agent ?? 'claude')
  const [model, setModel] = useState(editing?.model ?? initial?.model ?? '')
  const [manager, setManager] = useState(!hasManager && (initial?.manager ?? false))
  const [capabilities, setCapabilities] = useState<TeamMemberCapabilities>(
    initial?.capabilities ?? EMPTY_TEAM_MEMBER_CAPABILITIES
  )
  const [bundleId, setBundleId] = useState('')
  function applyBundle(id: string): void {
    const bundle = TEAM_ROLE_BUNDLES.find((entry) => entry.id === id)
    if (!bundle) {
      return
    }
    setBundleId(id)
    setRole(bundle.role)
    setBrief(bundle.brief)
    setAgent(bundle.agent)
    setCapabilities(bundle.capabilities)
    setManager(!hasManager && Boolean(bundle.manager))
    if (!displayName.trim()) {
      setDisplayName(bundle.label)
    }
  }
  // A slug is fixed once hired, so an edit keeps the one the member already answers to.
  const slug = editing?.slug ?? toTeamSlug(displayName)
  const roleSlug = toTeamSlug(role)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editing
              ? translate('team.member.editTitle', 'Edit member')
              : translate('team.member.title', 'Add a member')}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? translate(
                  'team.member.editDescription',
                  'The new details apply the next time this member starts.'
                )
              : translate(
                  'team.member.description',
                  'Members start in their own worktree with this role brief.'
                )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {/* A bundle seeds a new hire; it would overwrite an edit, so it only appears when adding. */}
          {editing ? null : (
            <Field
              label={translate('team.member.bundle', 'Role bundle')}
              htmlFor="team-member-bundle"
            >
              <Select value={bundleId} onValueChange={applyBundle}>
                <SelectTrigger id="team-member-bundle" className="w-full">
                  <SelectValue
                    placeholder={translate('team.member.bundlePlaceholder', 'Start from a role…')}
                  />
                </SelectTrigger>
                <SelectContent>
                  {TEAM_ROLE_BUNDLES.map((bundle) => (
                    <SelectItem key={bundle.id} value={bundle.id}>
                      {bundle.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          <Field label={translate('team.member.name', 'Name')} htmlFor="team-member-name">
            <Input
              id="team-member-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </Field>
          <Field label={translate('team.member.role', 'Role')} htmlFor="team-member-role">
            <Input
              id="team-member-role"
              value={role}
              onChange={(event) => setRole(event.target.value)}
              placeholder={translate('team.member.rolePlaceholder', 'engineer, reviewer, qa…')}
            />
          </Field>
          <Field label={translate('team.member.brief', 'Role brief')} htmlFor="team-member-brief">
            <Textarea
              id="team-member-brief"
              value={brief}
              onChange={(event) => setBrief(event.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={translate('team.member.agent', 'Agent')} htmlFor="team-member-agent">
              <Select value={agent} onValueChange={setAgent}>
                <SelectTrigger id="team-member-agent" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AGENT_CATALOG.map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      {entry.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field
              label={translate('team.member.model', 'Model (optional)')}
              htmlFor="team-member-model"
            >
              <Input
                id="team-member-model"
                value={model}
                onChange={(event) => setModel(event.target.value)}
              />
            </Field>
          </div>
          {!hasManager && !editing ? (
            <div className="flex items-center gap-2">
              <Switch id="team-member-manager" checked={manager} onCheckedChange={setManager} />
              <Label htmlFor="team-member-manager">
                {translate('team.member.manager', 'This member runs the team')}
              </Label>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            disabled={busy || !slug || !roleSlug}
            onClick={() =>
              slug && roleSlug
                ? void onSubmit({
                    slug,
                    displayName,
                    role: roleSlug,
                    brief,
                    agent,
                    model: model.trim() || undefined,
                    manager,
                    capabilities
                  })
                : undefined
            }
          >
            {editing
              ? translate('team.member.save', 'Save changes')
              : translate('team.member.submit', 'Add member')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
