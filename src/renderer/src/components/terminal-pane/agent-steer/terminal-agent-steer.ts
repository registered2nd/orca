import type { Terminal } from '@xterm/xterm'
import type { PaneManager } from '@/lib/pane-manager/pane-manager'
import { useAppStore } from '@/store/index'
import type { PaneForegroundAgentEntry } from '@/store/slices/agent-status/pane-foreground-agent'
import type { AgentStatusEntry } from '../../../../../shared/agent-status/contracts/agent-status-types'
import { readTerminalComposerTypedText } from '../../../../../shared/terminal/input/terminal-composer-draft'
import { readTerminalCursorLineContext } from '../../../../../shared/terminal/input/terminal-cursor-line-context'
import { makePaneKey } from '../../../../../shared/workspace-layout/stable-pane-id'

/** Follows a steered message so the agent folds it into its task instead of reading the stop as an order to drop it. */
export const TERMINAL_STEER_TAG = '[Steer, not a stop: fold this into the task and carry on.]'

export type SteerPaneState = {
  agentStatusByPaneKey: Record<string, AgentStatusEntry | undefined>
  paneForegroundAgentByPaneKey: Record<string, PaneForegroundAgentEntry | undefined>
}

export type SteerTerminal = Pick<Terminal, 'input' | 'onWriteParsed' | 'buffer' | 'modes' | 'rows'>

export type SteerOutcome = 'submitted' | 'steered' | 'left-in-composer' | 'aborted' | 'busy'

export type SteerTiming = {
  /** Least wait after Escape before the screen may count as settled. */
  minSettleMs: number
  /** Output silence that marks Claude Code's interrupt as painted. */
  quietMs: number
  /** Longest wait for that silence; a still-busy agent queues the steer instead. */
  maxSettleMs: number
  /** Longest wait for the tag to show in the input box before Enter. */
  echoTimeoutMs: number
  pollMs: number
}

const DEFAULT_TIMING: SteerTiming = {
  minSettleMs: 150,
  quietMs: 250,
  maxSettleMs: 3000,
  echoTimeoutMs: 2000,
  pollMs: 25
}

const steersInFlight = new Set<string>()

function isClaudeCodePane(state: SteerPaneState, paneKey: string): boolean {
  const row = state.agentStatusByPaneKey[paneKey]
  if (row?.agentType) {
    return row.agentType === 'claude'
  }
  const foreground = state.paneForegroundAgentByPaneKey[paneKey]
  return foreground?.agent === 'claude' && !foreground.shellForeground
}

/** The user's text in Claude Code's input box; null when no input box is on screen. */
function readTypedDraft(terminal: SteerTerminal): string | null {
  return readTerminalComposerTypedText(readTerminalCursorLineContext(terminal, terminal.rows))
}

const collapseSpace = (text: string): string => text.replace(/\s+/g, ' ').trim()

/** A steer needs a Claude Code pane whose input box holds typed text; anything else keeps the chord's terminal meaning. */
export function canSteerTerminalAgent(
  state: SteerPaneState,
  paneKey: string,
  terminal: SteerTerminal
): boolean {
  return isClaudeCodePane(state, paneKey) && Boolean(readTypedDraft(terminal)?.trim())
}

export function createActivePaneSteerCheck(
  managerRef: React.RefObject<PaneManager | null>,
  tabId: string
): () => boolean {
  return () => {
    const pane = managerRef.current?.getActivePane() ?? managerRef.current?.getPanes()[0]
    return pane
      ? canSteerTerminalAgent(
          useAppStore.getState(),
          makePaneKey(tabId, pane.leafId),
          pane.terminal
        )
      : false
  }
}

/**
 * Sends the typed message as a steer: Escape stops the running step (Claude Code keeps the typed
 * text in its input box), the tag goes after the text once the screen settles, and Enter submits.
 * An agent that is not working gets a plain Enter. Input goes through xterm as typed keys, so
 * Orca's own input tracking sees it as the user's.
 */
export async function steerTerminalAgent(args: {
  paneKey: string
  terminal: SteerTerminal
  getState?: () => SteerPaneState
  timing?: Partial<SteerTiming>
}): Promise<SteerOutcome> {
  const { paneKey, terminal } = args
  const timing = { ...DEFAULT_TIMING, ...args.timing }
  const state = (args.getState ?? useAppStore.getState)()
  if (steersInFlight.has(paneKey)) {
    return 'busy'
  }
  steersInFlight.add(paneKey)
  const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
  try {
    // Why: a tag after a slash command would become its arguments.
    const isCommand = readTypedDraft(terminal)?.trim().startsWith('/') === true
    if (state.agentStatusByPaneKey[paneKey]?.state !== 'working' || isCommand) {
      terminal.input('\r', true)
      return 'submitted'
    }
    const escapeAt = Date.now()
    let lastOutputAt = escapeAt
    const output = terminal.onWriteParsed(() => {
      lastOutputAt = Date.now()
    })
    try {
      // Why: one Escape only; Claude Code arms "Esc again to clear" on the kept draft.
      terminal.input('\x1b', true)
      await sleep(timing.minSettleMs)
      while (
        Date.now() - escapeAt < timing.maxSettleMs &&
        Date.now() - lastOutputAt < timing.quietMs
      ) {
        await sleep(timing.pollMs)
      }
    } finally {
      output.dispose()
    }
    if (!readTypedDraft(terminal)?.trim()) {
      return 'aborted'
    }
    // Why: Ctrl+E puts Claude Code's cursor at the end of the line, so the tag lands after the text.
    terminal.input('\x05', true)
    await sleep(timing.pollMs)
    terminal.input(` ${TERMINAL_STEER_TAG}`, true)
    const tag = collapseSpace(TERMINAL_STEER_TAG)
    const echoDeadline = Date.now() + timing.echoTimeoutMs
    while (Date.now() < echoDeadline) {
      await sleep(timing.pollMs)
      // Why: Enter only once the box ends with the tag, so a moved cursor or lost draft is never submitted blind.
      if (collapseSpace(readTypedDraft(terminal) ?? '').endsWith(tag)) {
        terminal.input('\r', true)
        return 'steered'
      }
    }
    return 'left-in-composer'
  } catch (error) {
    console.warn('[terminal-steer] steer failed:', error)
    return 'aborted'
  } finally {
    steersInFlight.delete(paneKey)
  }
}
