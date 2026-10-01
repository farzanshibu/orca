import React, { useState } from 'react'
import { Copy, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import type { RuntimeClientTarget } from '@/runtime/runtime-client-target'
import {
  TeamMemberCapabilitiesSchema,
  parseTeamMemberCapabilities
} from '../../../../shared/team-capabilities'
import { exportTeamMember, setTeamMemberCapabilities } from './team-runtime-client'
import type { TeamMember } from './team-snapshot-types'
import type { TeamAct } from './use-team-page-state'

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export function TeamCapabilitiesEditor({
  target,
  teamId,
  member,
  busy,
  act
}: {
  target: RuntimeClientTarget
  teamId: string
  member: TeamMember
  busy: boolean
  act: TeamAct
}): React.JSX.Element {
  const current = parseTeamMemberCapabilities(member.capabilities)
  const [skills, setSkills] = useState(current.skills.join(', '))
  const [connections, setConnections] = useState(current.connections.join(', '))
  const [mcp, setMcp] = useState(
    current.mcpServers.length > 0 ? JSON.stringify(current.mcpServers, null, 2) : ''
  )
  const [problem, setProblem] = useState<string | null>(null)

  async function save(): Promise<void> {
    let mcpServers: unknown = []
    try {
      mcpServers = mcp.trim() ? JSON.parse(mcp) : []
    } catch {
      setProblem(translate('team.caps.badJson', 'MCP servers must be a JSON array.'))
      return
    }
    const parsed = TeamMemberCapabilitiesSchema.safeParse({
      skills: splitList(skills),
      connections: splitList(connections),
      mcpServers
    })
    if (!parsed.success) {
      setProblem(parsed.error.issues[0]?.message ?? null)
      return
    }
    setProblem(null)
    await act(() =>
      setTeamMemberCapabilities(target, {
        team: teamId,
        member: member.id,
        capabilities: parsed.data
      })
    )
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="team-caps-skills">{translate('team.caps.skills', 'Skills')}</Label>
          <Input id="team-caps-skills" value={skills} onChange={(e) => setSkills(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="team-caps-connections">
            {translate('team.caps.connections', 'Connections')}
          </Label>
          <Input
            id="team-caps-connections"
            value={connections}
            onChange={(e) => setConnections(e.target.value)}
            placeholder={translate('team.caps.connectionsPlaceholder', 'github, linear')}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="team-caps-mcp">{translate('team.caps.mcp', 'MCP servers (JSON)')}</Label>
        <Textarea
          id="team-caps-mcp"
          value={mcp}
          onChange={(e) => setMcp(e.target.value)}
          placeholder={translate(
            'team.caps.mcpPlaceholder',
            '[{"name": "docs", "command": "npx", "args": ["-y", "docs-mcp"]}]'
          )}
          className="min-h-16"
        />
      </div>
      {problem ? <p className="text-[12px] text-destructive">{problem}</p> : null}
      <div className="flex items-center gap-1.5">
        <Button size="xs" variant="secondary" disabled={busy} onClick={() => void save()}>
          <Save />
          {translate('team.caps.save', 'Save grants (next start)')}
        </Button>
        <Button
          size="xs"
          variant="ghost"
          disabled={busy}
          onClick={() =>
            void act(async () => {
              const { template } = await exportTeamMember(target, {
                team: teamId,
                member: member.id
              })
              await navigator.clipboard.writeText(JSON.stringify(template, null, 2))
            })
          }
        >
          <Copy />
          {translate('team.caps.copyTemplate', 'Copy as template')}
        </Button>
      </div>
    </div>
  )
}
