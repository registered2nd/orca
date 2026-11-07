import { OrcaRuntimeWithResubmitHeldAgentPrompt } from './terminal-agent-prompt-resubmit'
import type { AgentPromptActivity } from './agent-prompt-submission-verification'
import type { RuntimeTerminalPromptDelivery } from '../../../../shared/runtime-terminal-send-contract'
import { readTerminalComposerTypedText } from '../../../../shared/terminal/input/terminal-composer-draft'

/** How long a mid-turn agent gets to take a submitted prompt out of its composer. */
export const AGENT_PROMPT_QUEUE_SETTLE_MS = 2000
const AGENT_PROMPT_QUEUE_POLL_MS = 50

export abstract class OrcaRuntimeWithObserveQueuedAgentPrompt extends OrcaRuntimeWithResubmitHeldAgentPrompt {
  /** A prompt sent mid-turn may start no turn of its own: the agent queues it, or takes it into
   *  the running turn at its next step. An empty composer after Enter shows the agent took it;
   *  the prompt still there, or no composer on screen, leaves the receipt at input_accepted. The
   *  wait is bounded by AGENT_PROMPT_QUEUE_SETTLE_MS, so it needs no abort signal. */
  protected async settleUnstartedAgentPrompt(
    ptyId: string,
    baseline: AgentPromptActivity,
    prompt: RuntimeTerminalPromptDelivery
  ): Promise<RuntimeTerminalPromptDelivery> {
    if (baseline.status !== 'working') {
      return prompt
    }
    const deadline = Date.now() + AGENT_PROMPT_QUEUE_SETTLE_MS
    for (;;) {
      const screen = await this.readCurrentTerminalWaitScreen(ptyId)
      if (screen === undefined || this.getPtyLifecycleGeneration(ptyId) !== baseline.generation) {
        return prompt
      }
      if (screen && this.readCaughtUpComposerTypedText(ptyId) === '') {
        // Settled: taken into the running turn, it has no turn start to claim, and left
        // registered it would claim the next prompt's turn start in its place.
        this.forgetAgentPromptRequest(ptyId, prompt.generation, prompt.requestId)
        return { ...prompt, stages: ['input_accepted', 'queued'] }
      }
      if (Date.now() >= deadline) {
        return prompt
      }
      await new Promise((resolve) => setTimeout(resolve, AGENT_PROMPT_QUEUE_POLL_MS))
    }
  }

  /** The user's text in a composer the screen model has fully caught up on; null when unknown. */
  protected readCaughtUpComposerTypedText(ptyId: string): string | null {
    const state = this.readWholeScreenModel(ptyId)
    return state && state.outputSequence === this.getPtyOutputSequence(ptyId)
      ? readTerminalComposerTypedText(state.emulator.getCursorLineContext())
      : null
  }
}
