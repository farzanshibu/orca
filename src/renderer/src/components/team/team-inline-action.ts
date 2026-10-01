import type { TeamAct } from './use-team-page-state'

export type TeamInlineOutcome<T> = { ok: true; value: T } | { ok: false; error: unknown }

/**
 * Runs a call through the page's `act`, so it counts as pending under `key` and the page refreshes
 * after it, but hands a failure back instead of to the page banner. For a dialog, which covers the
 * banner and has to show the error itself.
 */
export async function runTeamActionInline<T>(
  act: TeamAct,
  key: string,
  call: () => Promise<T>
): Promise<TeamInlineOutcome<T>> {
  const settled: { outcome?: TeamInlineOutcome<T> } = {}
  await act(async () => {
    try {
      settled.outcome = { ok: true, value: await call() }
    } catch (error) {
      settled.outcome = { ok: false, error }
    }
  }, key)
  return settled.outcome ?? { ok: false, error: new Error('The action did not run.') }
}

export function teamActionErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
