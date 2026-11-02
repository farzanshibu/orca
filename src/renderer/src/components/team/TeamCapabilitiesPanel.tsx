import React, { useEffect, useState } from 'react'
import { ClipboardList, Code2, LayoutTemplate, Palette, Pencil, Plus, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { RuntimeClientTarget } from '@/runtime/runtime-client-target'
import {
  TEAM_AGENT_TEMPLATES,
  parseTeamMemberCapabilities,
  type TeamRoleBundle
} from '../../../../shared/team-capabilities'
import { TeamCapabilitiesEditor } from './TeamCapabilitiesEditor'
import { teamAgentLabel } from './team-agent-label'
import { Portrait, memberLook } from './office-floor-sprite'
import type { TeamMemberDraft } from './team-runtime-client'
import type { TeamMember } from './team-snapshot-types'
import { teamMemberStatus } from './team-member-status'
import type { TeamAct } from './use-team-page-state'

function templateLabel(bundle: TeamRoleBundle): string {
  switch (bundle.id) {
    case 'designer':
      return translate('team.capabilities.template.designer', 'Designer')
    case 'software-engineer':
      return translate('team.capabilities.template.softwareEngineer', 'Software Engineer')
    case 'product-manager':
      return translate('team.capabilities.template.productManager', 'Product Manager')
    case 'frontend-developer':
      return translate('team.capabilities.template.frontendDeveloper', 'Frontend Developer')
    default:
      return bundle.label
  }
}

const TEMPLATE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  designer: Palette,
  'software-engineer': Code2,
  'product-manager': ClipboardList,
  'frontend-developer': LayoutTemplate
}

function bundleChips(bundle: TeamRoleBundle): string[] {
  return [...bundle.capabilities.skills, ...bundle.capabilities.connections]
}

function TemplateCard({
  bundle,
  onPick
}: {
  bundle: TeamRoleBundle
  onPick: (bundle: TeamRoleBundle) => void
}): React.JSX.Element {
  const Icon = TEMPLATE_ICONS[bundle.id] ?? Sparkles
  const chips = bundleChips(bundle)
  return (
    <button
      type="button"
      onClick={() => onPick(bundle)}
      className="bureau-card flex flex-col gap-2 p-3 text-left"
    >
      <div className="flex items-center gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center border-2 border-bureau-ink bg-bureau-paper-deep">
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
          {templateLabel(bundle)}
        </span>
        <Plus className="size-3.5 shrink-0" />
      </div>
      <div className="flex flex-wrap gap-1">
        {chips.slice(0, 3).map((chip) => (
          <span key={chip} className="bureau-chip">
            {chip}
          </span>
        ))}
        {chips.length > 3 ? <span className="bureau-chip">+{chips.length - 3}</span> : null}
      </div>
    </button>
  )
}

export function TeamCapabilitiesPanel({
  target,
  teamId,
  members,
  member,
  busy,
  act,
  onEditMember,
  onAddMember
}: {
  target: RuntimeClientTarget
  teamId: string
  members: readonly TeamMember[]
  member: TeamMember | null
  busy: boolean
  act: TeamAct
  onEditMember: (member: TeamMember) => void
  onAddMember: (initial?: Partial<TeamMemberDraft>) => void
}): React.JSX.Element {
  const [pickedId, setPickedId] = useState(member?.id ?? members[0]?.id ?? null)
  useEffect(() => {
    if (members.some((entry) => entry.id === pickedId)) {
      return
    }
    setPickedId(member?.id ?? members[0]?.id ?? null)
  }, [member, members, pickedId])
  const picked = members.find((entry) => entry.id === pickedId) ?? null
  const grants = picked ? parseTeamMemberCapabilities(picked.capabilities) : null
  return (
    <div className="scrollbar-sleek flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
      <section className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="bureau-display">
            {translate('team.capabilities.templates', 'Agent templates')}
          </h2>
          <span className="text-[12px] text-bureau-ink-soft">
            {translate(
              'team.capabilities.templatesHint',
              'Role bundles of skills and MCP servers — pick one to prefill a hire.'
            )}
          </span>
        </div>
        <div className="grid gap-2 @xl/team-dock:grid-cols-2 @4xl/team-dock:grid-cols-4">
          {TEAM_AGENT_TEMPLATES.map((bundle) => (
            <TemplateCard
              key={bundle.id}
              bundle={bundle}
              onPick={(entry) =>
                onAddMember({
                  displayName: entry.label,
                  role: entry.role,
                  brief: entry.brief,
                  agent: entry.agent,
                  capabilities: entry.capabilities
                })
              }
            />
          ))}
        </div>
      </section>
      {picked && grants ? (
        <>
          <section className="bureau-card space-y-2 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="bureau-display text-bureau-ink-soft">
                {translate('team.capabilities.perAgent', 'Per agent')}
              </h3>
              <span className="text-[12px] text-bureau-ink-soft">
                {picked.role_slug} · {teamAgentLabel(picked.agent)}
                {picked.model ? ` · ${picked.model}` : ''}
              </span>
            </div>
            <div className="scrollbar-sleek flex gap-1 overflow-x-auto pb-1">
              {members.map((entry) => {
                const status = teamMemberStatus(entry)
                return (
                  <button
                    key={entry.id}
                    type="button"
                    aria-label={translate('team.capabilities.pickAgent', 'Manage {{name}}', {
                      name: entry.display_name
                    })}
                    data-active={entry.id === picked.id ? 'true' : undefined}
                    onClick={() => setPickedId(entry.id)}
                    className="bureau-roster-pick"
                  >
                    <Portrait look={memberLook(entry.slug, Boolean(entry.is_manager))} size={28} />
                    <span className="w-full truncate text-center text-[11px]">
                      {entry.display_name}
                    </span>
                    <span className="bureau-dot" data-tone={status.tone} title={status.label} />
                  </button>
                )
              })}
            </div>
            <p className="text-[12px] text-bureau-ink-soft">
              {translate(
                'team.capabilities.hint',
                'Grants apply the next time this agent starts: skills it may load, connections it may reach, and MCP servers it may run.'
              )}
            </p>
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-bureau-ink-soft">
              <span className="bureau-chip" data-tone="info">
                {translate('team.capabilities.skillCount', '{{count}} skills', {
                  count: grants.skills.length
                })}
              </span>
              <span className="bureau-chip" data-tone="info">
                {translate('team.capabilities.connectionCount', '{{count}} connections', {
                  count: grants.connections.length
                })}
              </span>
              <span className="bureau-chip" data-tone="info">
                {translate('team.capabilities.mcpCount', '{{count}} MCP servers', {
                  count: grants.mcpServers.length
                })}
              </span>
            </div>
            <TeamCapabilitiesEditor
              key={picked.id}
              target={target}
              teamId={teamId}
              member={picked}
              busy={busy}
              act={act}
            />
          </section>
          <section className="bureau-card space-y-2 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="bureau-display text-bureau-ink-soft">
                {translate('team.capabilities.bundle', 'Role bundle')}
              </h3>
              <Button size="xs" variant="secondary" onClick={() => onEditMember(picked)}>
                <Pencil />
                {translate('team.capabilities.editBundle', 'Edit bundle')}
              </Button>
            </div>
            <p className="text-[12px] text-bureau-ink-soft">
              {picked.role_brief ||
                translate(
                  'team.capabilities.noBrief',
                  'No role brief yet. Edit the member to describe how this agent works.'
                )}
            </p>
          </section>
        </>
      ) : (
        <p className="text-[13px] text-bureau-ink-soft">
          {translate(
            'team.capabilities.noMember',
            'Hire an agent to give it skills and connections.'
          )}
        </p>
      )}
    </div>
  )
}
