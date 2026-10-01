import { OrchestrationError } from '../../../../orchestration/orchestration-error'
import { defineMethod } from '../../../core'
import { resolveOrchestrationCaller } from '../runs/run-scope'
import { WorkerStartParams } from './worker-start-schema'
import { assertWorkerStartTimeout, startWorkerForRun } from './worker-start-for-run'

export const ORCHESTRATION_WORKER_START_METHODS = [
  defineMethod({
    name: 'orchestration.workerStart',
    params: WorkerStartParams,
    handler: async (
      params,
      { runtime, orchestrationMutation, orchestrationCompatibilityEvidence, orchestrationCaller }
    ) => {
      assertWorkerStartTimeout(params)
      const db = runtime.getOrchestrationDb()
      const coordinator = resolveOrchestrationCaller(runtime, {
        callerTerminalHandle: params.from,
        callerEvidence: orchestrationCompatibilityEvidence,
        callerSession: orchestrationCaller
      })
      const run = coordinator ? db.getCurrentRunForCoordinator(coordinator) : undefined
      if (!run || (params.run && params.run !== run.id)) {
        throw new OrchestrationError(
          'consumer_fenced',
          'worker-start requires the coordinator terminal currently bound to the Task Run.'
        )
      }
      const existingTask = params.task ? db.getTask(params.task) : undefined
      if (params.task && (!existingTask || existingTask.run_id !== run.id)) {
        throw new OrchestrationError(
          'task_not_found',
          `Task ${params.task} was not found in Run ${run.id}.`
        )
      }
      return startWorkerForRun({
        params,
        runtime,
        db,
        run,
        coordinator,
        callerSession: orchestrationCaller,
        existingTask,
        orchestrationMutation
      })
    }
  })
]
