import { getAgentLabel } from '@/lib/agent-catalog'
import { isTuiAgent } from '../../../../shared/tui-agent-config'

/** The agent's product name; an id this build does not know is shown as sent. */
export function teamAgentLabel(agent: string): string {
  return isTuiAgent(agent) ? getAgentLabel(agent) : agent
}
