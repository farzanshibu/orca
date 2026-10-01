import {
  TeamAnswerParams,
  TeamGateResolveParams,
  TeamLogParams
} from '../../../../../shared/rpc-contract/orchestration-team-params'
import { OrchestrationError } from '../../../orchestration/orchestration-error'
import { requireTeamOperator, resolveTeamCaller } from '../../../team/team-caller-authority'
import { defineMethod } from '../../core'
import { exposeMessage } from '../orchestration/messaging/mailbox-message-receipt'
import { resolveTeamFromParams } from './team-selector'

export const TEAM_INBOX_METHODS = [
  defineMethod({
    name: 'orchestration.teamLog',
    params: TeamLogParams,
    handler: async (params, context) => {
      const db = context.runtime.getOrchestrationDb()
      const team = await resolveTeamFromParams(context, db, params)
      return { messages: db.listRecentTeamMessages(team.run_id, params.limit ?? 100) }
    }
  }),

  defineMethod({
    name: 'orchestration.teamAnswer',
    params: TeamAnswerParams,
    handler: async (params, context) => {
      const { runtime } = context
      const db = runtime.getOrchestrationDb()
      const team = await resolveTeamFromParams(context, db, params)
      requireTeamOperator(resolveTeamCaller(context, db, team), "answer the team's questions")
      const question = db.getQuestion(params.id)
      if (!question || question.run_id !== team.run_id) {
        throw new OrchestrationError(
          'question_not_found',
          `Question ${params.id} was not found in team ${team.name}.`
        )
      }
      const run = db.getRun(team.run_id)
      if (!run) {
        throw new OrchestrationError('run_not_found', `Team Run ${team.run_id} is missing.`)
      }
      // Why the Run's own generation: the operator answers for the team, not as its coordinator.
      const answered = db.answerQuestion({
        messageId: question.message_id,
        runId: run.id,
        consumerGeneration: run.consumer_generation,
        body: params.body
      })
      // The mailbox files the answer under the Run's address, which reads as the manager's.
      db.attributeTeamActivityMessage(answered.message.id, { party: 'operator' })
      if (db.getFederatedDispatch(question.dispatch_id)) {
        db.enqueueFederationRelay({
          dispatchId: question.dispatch_id,
          direction: 'to_worker',
          kind: 'reply',
          payload: JSON.stringify({
            questionId: question.message_id,
            answerMessageId: answered.message.id,
            body: params.body
          })
        })
        runtime.ensureOrchestrationFederationRelay(run.id)
      } else {
        runtime.notifyMessageArrived(`dispatch:${question.dispatch_id}`, 'status')
      }
      return {
        message: exposeMessage(answered.message),
        question: answered.question,
        duplicate: answered.duplicate
      }
    }
  }),

  defineMethod({
    name: 'orchestration.teamGateResolve',
    params: TeamGateResolveParams,
    handler: async (params, context) => {
      const db = context.runtime.getOrchestrationDb()
      const team = await resolveTeamFromParams(context, db, params)
      requireTeamOperator(resolveTeamCaller(context, db, team), "resolve the team's gates")
      const gate = db.getGate(params.id)
      if (!gate || gate.run_id !== team.run_id) {
        throw new OrchestrationError(
          'gate_not_found',
          `Gate ${params.id} was not found in team ${team.name}.`
        )
      }
      if (gate.status !== 'pending') {
        throw new OrchestrationError(
          'team_conflict',
          `Gate ${params.id} is already ${gate.status}.`
        )
      }
      const resolved = db.resolveGate(gate.id, params.resolution)
      db.attributeTeamGateResolution(gate.task_id, { party: 'operator' })
      return { gate: resolved }
    }
  })
]
