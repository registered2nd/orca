import type { AgentStatusEntry } from '../../../../shared/agent-status-types'

/** The reply to read aloud when `entry` just finished a turn, else null. */
export function finishedTurnReply(
  entry: AgentStatusEntry | undefined,
  previous: AgentStatusEntry | undefined,
  notBefore: number
): string | null {
  if (!entry || entry.state !== 'done' || previous?.state === 'done') {
    return null
  }
  // Why: rows restored at startup are old turns, not fresh replies.
  if (entry.restoredUnconfirmed || entry.stateStartedAt < notBefore) {
    return null
  }
  if (entry.sessionBoundary || entry.interrupted || entry.lastAssistantMessageIsToolOutput) {
    return null
  }
  const reply = entry.lastAssistantMessage?.trim()
  return reply ? reply : null
}

/** True when the user just started a new turn in this pane (so its old reply should stop). */
export function startedNewTurn(
  entry: AgentStatusEntry | undefined,
  previous: AgentStatusEntry | undefined
): boolean {
  return entry?.state === 'working' && previous?.state !== 'working'
}
