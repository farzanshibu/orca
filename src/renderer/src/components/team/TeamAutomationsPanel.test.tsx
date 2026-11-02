// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TeamAutomationsPanel } from './TeamAutomationsPanel'

vi.mock('./team-runtime-client', () => ({
  listTeamMissions: vi.fn(async () => ({
    missions: [
      {
        id: 'mission_1',
        name: 'Hourly heartbeat',
        target: 'manager',
        prompt: 'Check the board.',
        schedule: JSON.stringify({ kind: 'interval', minutes: 60 }),
        enabled: 1,
        last_run_at: '2026-11-02 09:00:00',
        next_run_at: '2027-11-02 10:00:00'
      }
    ]
  })),
  readTeamTriggers: vi.fn(async () => ({
    triggerMode: 'communication-only',
    autoCompactTokens: null,
    webhookToken: null,
    webhookUrl: null
  })),
  addTeamMission: vi.fn(async () => undefined),
  removeTeamMission: vi.fn(async () => undefined),
  setTeamMissionEnabled: vi.fn(async () => undefined),
  setTeamTriggers: vi.fn(async () => undefined)
}))

const act = async (mutation: () => Promise<unknown>): Promise<boolean> => {
  await mutation()
  return true
}

describe('TeamAutomationsPanel', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('shows the floor clock, a scheduled mission and the trigger cards', async () => {
    render(
      <TeamAutomationsPanel target={{ kind: 'local' }} teamId="team_1" busy={false} act={act} />
    )
    expect(await screen.findByText('Hourly heartbeat')).toBeTruthy()
    expect(screen.getByText('Floor clock')).toBeTruthy()
    expect(screen.getByRole('img', { name: /Local time/ })).toBeTruthy()
    expect(screen.getAllByText('Scheduled').length).toBeGreaterThan(0)
    expect(screen.getByText('Last run')).toBeTruthy()
    expect(screen.getByText('Outside triggers')).toBeTruthy()
    expect(screen.getByText('Turn on webhook')).toBeTruthy()
  })
})
