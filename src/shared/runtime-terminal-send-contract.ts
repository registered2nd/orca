import type { WriteSettlement } from './terminal/pty/lifecycle/pty-write-settlement'

export type RuntimeTerminalSend = {
  handle: string
  accepted: boolean
  bytesWritten: number
  refusedReason?: 'no-agent' | 'permission'
  prompt?: RuntimeTerminalPromptDelivery
  writeSettlement?: WriteSettlement
}

/** `queued`: the agent was mid-turn and took the prompt out of its composer; it runs within that
 *  turn or after it, so no turn start of its own may follow. */
export type RuntimeTerminalPromptStage = 'input_accepted' | 'queued' | 'turn_started'

export type RuntimeTerminalPromptDelivery = {
  requestId: string
  stages: RuntimeTerminalPromptStage[]
  provider: 'antigravity' | 'claude' | 'codex' | 'unsupported' | 'old-host'
  observation: 'supported' | 'unsupported' | 'incarnation_replaced' | 'permission'
  processIncarnation: string
  generation: number
  baselineWorkingSequence: number
  /** Hook turn-start timestamp before this prompt was accepted. */
  baselineExplicitWorkingStartedAt?: number | null
  /** Permission observations seen before this prompt was accepted. */
  baselinePermissionSequence?: number
}
