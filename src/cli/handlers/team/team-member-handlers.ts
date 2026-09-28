import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { TEAM_ROLE_BUNDLES } from '../../../shared/team-capabilities'
import type { CommandHandler } from '../../dispatch'
import { getOptionalStringFlag, getRequiredStringFlag } from '../../flags'
import { printResult } from '../../format'
import {
  formatMember,
  memberFieldParams,
  memberHandler,
  teamParams,
  type MemberView
} from './team-cli-format'

export const TEAM_MEMBER_HANDLERS: Record<string, CommandHandler> = {
  'team member add': async ({ flags, client, json }) => {
    const bundleId = getOptionalStringFlag(flags, 'bundle')
    const bundle = bundleId ? TEAM_ROLE_BUNDLES.find((entry) => entry.id === bundleId) : undefined
    if (bundleId && !bundle) {
      throw new Error(
        `Unknown bundle "${bundleId}". Choose one of: ${TEAM_ROLE_BUNDLES.map((b) => b.id).join(', ')}.`
      )
    }
    const fields = memberFieldParams(flags)
    const result = await client.call<{ member: MemberView }>('orchestration.teamMemberAdd', {
      ...teamParams(flags),
      slug: getRequiredStringFlag(flags, 'slug'),
      ...fields,
      role: fields.role ?? bundle?.role,
      brief: fields.brief ?? bundle?.brief,
      agent: fields.agent ?? bundle?.agent,
      manager: flags.has('manager') || bundle?.manager ? true : undefined,
      ...(bundle ? { capabilities: bundle.capabilities } : {})
    })
    printResult(result, json, (value) => `Added ${formatMember(value.member)}`)
  },

  'team member update': async ({ flags, client, json }) => {
    const result = await client.call<{ member: MemberView }>('orchestration.teamMemberUpdate', {
      ...teamParams(flags),
      member: getRequiredStringFlag(flags, 'member'),
      ...memberFieldParams(flags)
    })
    printResult(result, json, (value) => `Updated ${formatMember(value.member)}`)
  },

  'team member rm': async ({ flags, client, json }) => {
    const result = await client.call<{ member: { slug: string } }>(
      'orchestration.teamMemberRemove',
      { ...teamParams(flags), member: getRequiredStringFlag(flags, 'member') }
    )
    printResult(result, json, (value) => `Removed ${value.member.slug}`)
  },

  'team member start': memberHandler('orchestration.teamMemberStart', 'Started'),
  'team member stop': memberHandler('orchestration.teamMemberStop', 'Stopped'),
  'team member pause': memberHandler('orchestration.teamMemberPause', 'Paused'),
  'team member resume': memberHandler('orchestration.teamMemberResume', 'Resumed'),

  'team member grant': async ({ flags, client, cwd, json }) => {
    const list = (name: string) =>
      (getOptionalStringFlag(flags, name) ?? '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
    const mcpFile = getOptionalStringFlag(flags, 'mcp-file')
    const mcpServers: unknown = mcpFile
      ? JSON.parse(await readFile(resolve(cwd, mcpFile), 'utf8'))
      : []
    const result = await client.call<{ member: MemberView }>(
      'orchestration.teamMemberSetCapabilities',
      {
        ...teamParams(flags),
        member: getRequiredStringFlag(flags, 'member'),
        capabilities: { skills: list('skills'), connections: list('connections'), mcpServers }
      }
    )
    printResult(
      result,
      json,
      (value) => `Granted: ${formatMember(value.member)} (applies on next start)`
    )
  },

  'team member export': async ({ flags, client, json }) => {
    const result = await client.call<{ template: unknown }>('orchestration.teamMemberExport', {
      ...teamParams(flags),
      member: getRequiredStringFlag(flags, 'member')
    })
    printResult(result, json, (value) => JSON.stringify(value.template, null, 2))
  },

  'team member import': async ({ flags, client, cwd, json }) => {
    const template: unknown = JSON.parse(
      await readFile(resolve(cwd, getRequiredStringFlag(flags, 'file')), 'utf8')
    )
    const result = await client.call<{ member: MemberView }>('orchestration.teamMemberImport', {
      ...teamParams(flags),
      template,
      slug: getOptionalStringFlag(flags, 'slug')
    })
    printResult(result, json, (value) => `Imported ${formatMember(value.member)}`)
  },

  'team member cap': async ({ flags, client, json }) => {
    const raw = getRequiredStringFlag(flags, 'usd')
    const capUsd = raw === 'none' ? null : Number(raw)
    if (capUsd !== null && (!Number.isFinite(capUsd) || capUsd < 0)) {
      throw new Error('--usd must be a non-negative amount or "none".')
    }
    const tokens = getOptionalStringFlag(flags, 'tokens')
    const result = await client.call<{ member: MemberView }>('orchestration.teamMemberSetCap', {
      ...teamParams(flags),
      member: getRequiredStringFlag(flags, 'member'),
      capUsd,
      ...(tokens !== undefined ? { tokenCap: tokens === 'none' ? null : Number(tokens) } : {})
    })
    printResult(result, json, (value) => `Cap set: ${formatMember(value.member)}`)
  },

  'team member send': async ({ flags, client, json }) => {
    const result = await client.call<{ handle: string }>('orchestration.teamMemberSend', {
      ...teamParams(flags),
      member: getRequiredStringFlag(flags, 'member'),
      text: getRequiredStringFlag(flags, 'text'),
      interrupt: flags.has('interrupt') ? true : undefined
    })
    printResult(result, json, (value) => `Sent to ${value.handle}`)
  }
}
