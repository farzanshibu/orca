import type { OrcaRuntimeService } from '../../../../orca-runtime'
import type { OrchestrationDb } from '../../../../orchestration/db'
import { OrchestrationError } from '../../../../orchestration/orchestration-error'
import type {
  OrchestrationCallerIdentity,
  OrchestrationSessionCaller
} from '../../../../orchestration/orchestration-caller-identity'
import type { RunRow, TaskRow } from '../../../../orchestration/types'
import {
  isWorkerStartTimeoutWithinTimerLimit,
  resolveWorkerStartReadinessTimeoutMs
} from '../../../../../../shared/orchestration-timing-budgets'
import {
  decideWorkerStartMode,
  readWorkerStartModeSettings
} from '../../orchestration-worker-start-mode'
import { assertTeamAcceptsWorkerStart } from '../../../../team/team-work-admission'
import { startFederatedWorker } from '../federation/federated-worker-start'
import { startLocalWorker } from './local-worker-start'
import type { WorkerStartInput } from './worker-start-schema'
import { assertWorkerStartTaskSpecWithinPromptBudget } from './worker-start-prompt-budget'

type WorkerStartMutation = Parameters<typeof startLocalWorker>[0]['orchestrationMutation']

export function assertWorkerStartTimeout(params: Pick<WorkerStartInput, 'timeoutMs'>): void {
  if (!isWorkerStartTimeoutWithinTimerLimit(params.timeoutMs)) {
    throw new OrchestrationError(
      'invalid_argument',
      '--timeout-ms is too large for worker-start transport grace; the derived timeout must fit within the timer limit.'
    )
  }
}

/**
 * Starts a worker for a Run whose coordinator is already resolved: the half of `worker-start` after
 * caller and Run checks, shared with team dispatch so both start workers the same way.
 */
export async function startWorkerForRun(args: {
  params: WorkerStartInput
  runtime: OrcaRuntimeService
  db: OrchestrationDb
  run: RunRow
  coordinator: OrchestrationCallerIdentity | null
  callerSession?: OrchestrationSessionCaller
  existingTask?: TaskRow
  orchestrationMutation?: WorkerStartMutation
}): Promise<unknown> {
  const { params, runtime, db, run, coordinator, callerSession, existingTask } = args
  assertWorkerStartTimeout(params)
  assertTeamAcceptsWorkerStart({ db, run, terminal: params.terminal, taskId: existingTask?.id })
  const readinessTimeoutMs = resolveWorkerStartReadinessTimeoutMs(params.timeoutMs)
  await assertWorkerStartTaskSpecWithinPromptBudget(params.spec ?? existingTask!.spec)
  const mode = decideWorkerStartMode({
    params,
    settings: readWorkerStartModeSettings(runtime)
  })
  if (params.on) {
    // A remote worker is always a terminal agent; the mode receipt rides along so the
    // coordinator still learns why its structured default did not apply.
    const receipt = await startFederatedWorker({
      params,
      runtime,
      db,
      runId: run.id,
      task: existingTask,
      orchestrationMutation: args.orchestrationMutation,
      callerSession
    })
    return receipt && typeof receipt === 'object' ? { ...receipt, mode } : receipt
  }
  return startLocalWorker({
    params: { ...params, timeoutMs: readinessTimeoutMs },
    runtime,
    db,
    run,
    coordinator,
    callerSession,
    existingTask,
    orchestrationMutation: args.orchestrationMutation,
    mode
  })
}
