import { createServer } from 'node:http'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nextTeamMissionRun } from '../../../shared/team-mission-schedule'
import { OrchestrationDb } from '../orchestration/db'
import { TeamMissionScheduler } from './team-mission-scheduler'
import { acceptTeamTrigger } from './team-trigger-intake'
import { TeamWebhookServer, teamWebhookPath } from './team-webhook-server'

describe('team triggers', () => {
  let db: OrchestrationDb

  function seed() {
    const team = db.createTeam({ repoId: 'repo_1', name: 'Platform' })
    const manager = db.addTeamMember(team.id, {
      slug: 'michael',
      roleSlug: 'manager',
      agent: 'claude',
      isManager: true
    })
    const jim = db.addTeamMember(team.id, { slug: 'jim', roleSlug: 'engineer', agent: 'codex' })
    return { team, manager, jim }
  }

  beforeEach(() => {
    db = new OrchestrationDb(':memory:')
  })

  afterEach(() => {
    db.close()
  })

  it('computes interval and next-daily runs', () => {
    const from = new Date(2026, 8, 28, 10, 0, 0)
    expect(nextTeamMissionRun({ kind: 'interval', minutes: 60 }, from)).toEqual(
      new Date(2026, 8, 28, 11, 0, 0)
    )
    expect(nextTeamMissionRun({ kind: 'daily', time: '09:00' }, from)).toEqual(
      new Date(2026, 8, 29, 9, 0, 0)
    )
    expect(nextTeamMissionRun({ kind: 'daily', time: '18:30' }, from)).toEqual(
      new Date(2026, 8, 28, 18, 30, 0)
    )
  })

  it('queues outside work, logs it as external, and creates tasks only when allowed', () => {
    const { team, manager } = seed()
    const quiet = acceptTeamTrigger(db, team, {
      source: 'webhook',
      text: 'Deploy failed',
      target: 'manager',
      task: { title: 'Fix deploy', spec: 'Look at CI' }
    })
    expect(quiet).toEqual({ queued: 1, taskId: null })
    expect(db.listPendingTeamQueue(manager.id)[0].text).toBe('[webhook] Deploy failed')
    expect(db.listRecentTeamMessages(team.run_id, 5)[0]).toMatchObject({
      from_handle: 'external:webhook',
      read: 1
    })

    db.setTeamTriggerSettings(team.id, { triggerMode: 'allow-all' })
    const allowed = acceptTeamTrigger(db, db.requireTeam(team.id), {
      source: 'webhook',
      text: 'Deploy failed again',
      target: '@all',
      task: { title: 'Fix deploy', spec: 'Look at CI' }
    })
    expect(allowed.queued).toBe(2)
    expect(allowed.taskId).not.toBeNull()
  })

  it('fires due missions once per slot and schedules the next', () => {
    const { team, manager } = seed()
    const start = new Date(2026, 8, 28, 10, 0, 0)
    const mission = db.addTeamMission(
      team.id,
      {
        name: 'heartbeat',
        target: 'manager',
        prompt: 'check board',
        schedule: { kind: 'interval', minutes: 30 }
      },
      start
    )
    let now = new Date(2026, 8, 28, 10, 20, 0)
    const scheduler = new TeamMissionScheduler(
      () => db,
      () => now
    )
    scheduler.tick()
    expect(db.listPendingTeamQueue(manager.id)).toHaveLength(0)
    now = new Date(2026, 8, 28, 10, 31, 0)
    scheduler.tick()
    scheduler.tick()
    expect(db.listPendingTeamQueue(manager.id).map((item) => item.text)).toEqual([
      '[mission:heartbeat] check board'
    ])
    expect(db.requireTeamMission(mission.id).last_run_at).not.toBeNull()
    db.setTeamMissionEnabled(mission.id, false)
    now = new Date(2026, 8, 28, 12, 0, 0)
    scheduler.tick()
    expect(db.listPendingTeamQueue(manager.id)).toHaveLength(1)
  })

  it('accepts webhooks only with the team token', async () => {
    const { team, manager } = seed()
    db.setTeamTriggerSettings(team.id, { webhook: 'enable' })
    const token = db.requireTeam(team.id).webhook_token
    const hooks = new TeamWebhookServer(() => db)
    const server = createServer((req, res) => void hooks.handle(req, res))
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') {
      throw new Error('expected a TCP listener')
    }
    const { port } = address
    const url = `http://127.0.0.1:${port}${teamWebhookPath(team.id)}`
    try {
      const denied = await fetch(url, {
        method: 'POST',
        headers: { authorization: 'Bearer nope' },
        body: JSON.stringify({ text: 'hi' })
      })
      expect(denied.status).toBe(401)
      const accepted = await fetch(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: 'Build is red' })
      })
      expect(accepted.status).toBe(202)
      expect(db.listPendingTeamQueue(manager.id).map((item) => item.text)).toEqual([
        '[webhook] Build is red'
      ])
      const bad = await fetch(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: '{"nope": 1}'
      })
      expect(bad.status).toBe(400)
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
})
