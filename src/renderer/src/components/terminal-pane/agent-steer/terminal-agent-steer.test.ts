import { Terminal } from '@xterm/headless'
import { afterEach, describe, expect, it } from 'vitest'
import {
  canSteerTerminalAgent,
  steerTerminalAgent,
  TERMINAL_STEER_TAG,
  type SteerPaneState,
  type SteerTerminal
} from './terminal-agent-steer'
import { resolveTerminalShortcutAction } from '../input/keyboard/terminal-shortcut-policy'
import type { AgentStatusEntry } from '../../../../../shared/agent-status/contracts/agent-status-types'

const PANE = 'tab-1:leaf-1'
const RULE = '─'.repeat(60)
const TIMING = { minSettleMs: 10, quietMs: 40, maxSettleMs: 600, echoTimeoutMs: 300, pollMs: 5 }

/** Paints Claude Code's input box and reacts to keys the way 2.1.x does (probed 2026-11-15). */
class FakeClaudeCode {
  readonly terminal = new Terminal({ cols: 120, rows: 20, allowProposedApi: true })
  readonly received: string[] = []
  readonly submitted: string[] = []
  working = true
  cursor: number
  constructor(
    public draft: string,
    private readonly options: {
      clearsDraftOnEscape?: boolean
      ignoresTyping?: boolean
      cursorAt?: number
    } = {}
  ) {
    this.cursor = options.cursorAt ?? draft.length
    this.terminal.onData((data) => this.receive(data))
    this.paint()
  }
  private receive(data: string): void {
    this.received.push(data)
    if (data === '\x1b') {
      this.working = false
      if (this.options.clearsDraftOnEscape) {
        this.draft = ''
        this.cursor = 0
      }
      // Claude Code repaints the screen twice within ~80 ms after an interrupt.
      setTimeout(() => this.paint(), 5)
      setTimeout(() => this.paint(), 25)
      return
    }
    if (data === '\r') {
      this.submitted.push(this.draft)
      this.draft = ''
      this.cursor = 0
    } else if (data === '\x05') {
      this.cursor = this.draft.length
    } else if (!this.options.ignoresTyping) {
      this.draft = this.draft.slice(0, this.cursor) + data + this.draft.slice(this.cursor)
      this.cursor += data.length
    }
    setTimeout(() => this.paint(), 5)
  }
  paint(): void {
    const spinner = this.working ? '✽ Transmogrifying… (6s)' : ''
    const prompt = `❯ ${this.draft}`
    this.terminal.write(
      `\x1b[2J\x1b[H\r\n${spinner}\r\n${RULE}\r\n${prompt}\r\n${RULE}\r\n  [Opus] footer\x1b[4;${this.cursor + 3}H`
    )
  }
  async settle(): Promise<void> {
    await new Promise<void>((resolve) => this.terminal.write('', resolve))
  }
}

function stateFor(agentType: string, status: AgentStatusEntry['state'] | null): SteerPaneState {
  return {
    agentStatusByPaneKey: status
      ? { [PANE]: { state: status, agentType, paneKey: PANE } as AgentStatusEntry }
      : {},
    paneForegroundAgentByPaneKey: {}
  }
}

const fakes: FakeClaudeCode[] = []
async function claude(
  draft: string,
  options?: ConstructorParameters<typeof FakeClaudeCode>[1]
): Promise<FakeClaudeCode> {
  const fake = new FakeClaudeCode(draft, options)
  fakes.push(fake)
  await fake.settle()
  return fake
}
const asSteerTerminal = (fake: FakeClaudeCode): SteerTerminal =>
  fake.terminal as unknown as SteerTerminal

afterEach(() => {
  fakes.splice(0).forEach((fake) => fake.terminal.dispose())
})

describe('steerTerminalAgent', () => {
  it('stops a working Claude Code with one Escape, then submits the draft with the tag', async () => {
    const fake = await claude('use the staging bucket instead')
    const outcome = await steerTerminalAgent({
      paneKey: PANE,
      terminal: asSteerTerminal(fake),
      getState: () => stateFor('claude', 'working'),
      timing: TIMING
    })
    expect(outcome).toBe('steered')
    expect(fake.received.filter((data) => data === '\x1b')).toHaveLength(1)
    expect(fake.received[0]).toBe('\x1b')
    expect(fake.submitted).toEqual([`use the staging bucket instead ${TERMINAL_STEER_TAG}`])
  })

  it('puts the tag after the text when the cursor sits inside it', async () => {
    const fake = await claude('use the staging bucket', { cursorAt: 4 })
    const outcome = await steerTerminalAgent({
      paneKey: PANE,
      terminal: asSteerTerminal(fake),
      getState: () => stateFor('claude', 'working'),
      timing: TIMING
    })
    expect(outcome).toBe('steered')
    expect(fake.submitted).toEqual([`use the staging bucket ${TERMINAL_STEER_TAG}`])
  })

  it('submits with a plain Enter when the agent is not working', async () => {
    const fake = await claude('next question')
    const outcome = await steerTerminalAgent({
      paneKey: PANE,
      terminal: asSteerTerminal(fake),
      getState: () => stateFor('claude', 'done'),
      timing: TIMING
    })
    expect(outcome).toBe('submitted')
    expect(fake.received).toEqual(['\r'])
    expect(fake.submitted).toEqual(['next question'])
  })

  it('submits a slash command without stopping the agent or tagging it', async () => {
    const fake = await claude('/compact')
    const outcome = await steerTerminalAgent({
      paneKey: PANE,
      terminal: asSteerTerminal(fake),
      getState: () => stateFor('claude', 'working'),
      timing: TIMING
    })
    expect(outcome).toBe('submitted')
    expect(fake.received).toEqual(['\r'])
  })

  it('sends nothing after the Escape when the draft is gone', async () => {
    const fake = await claude('lost words', { clearsDraftOnEscape: true })
    const outcome = await steerTerminalAgent({
      paneKey: PANE,
      terminal: asSteerTerminal(fake),
      getState: () => stateFor('claude', 'working'),
      timing: TIMING
    })
    expect(outcome).toBe('aborted')
    expect(fake.received).toEqual(['\x1b'])
    expect(fake.submitted).toEqual([])
  })

  it('leaves the message unsent when the tag never shows at the end of the input box', async () => {
    const fake = await claude('keep going', { ignoresTyping: true })
    const outcome = await steerTerminalAgent({
      paneKey: PANE,
      terminal: asSteerTerminal(fake),
      getState: () => stateFor('claude', 'working'),
      timing: TIMING
    })
    expect(outcome).toBe('left-in-composer')
    expect(fake.received).toEqual(['\x1b', '\x05', ` ${TERMINAL_STEER_TAG}`])
    expect(fake.submitted).toEqual([])
  })
})

describe('canSteerTerminalAgent', () => {
  it('needs a Claude Code pane with typed text in its input box', async () => {
    const typed = await claude('fold this in')
    const empty = await claude('')
    expect(canSteerTerminalAgent(stateFor('claude', 'working'), PANE, asSteerTerminal(typed))).toBe(
      true
    )
    expect(canSteerTerminalAgent(stateFor('claude', 'working'), PANE, asSteerTerminal(empty))).toBe(
      false
    )
    expect(canSteerTerminalAgent(stateFor('codex', 'working'), PANE, asSteerTerminal(typed))).toBe(
      false
    )
    expect(canSteerTerminalAgent(stateFor('claude', null), PANE, asSteerTerminal(typed))).toBe(
      false
    )
  })
})

describe('steer chord', () => {
  const ctrlEnter = {
    key: 'Enter',
    code: 'Enter',
    metaKey: false,
    ctrlKey: true,
    altKey: false,
    shiftKey: false,
    repeat: false
  }
  const resolve = (canSteer: boolean) =>
    resolveTerminalShortcutAction(
      ctrlEnter,
      false,
      'true',
      0,
      true,
      undefined,
      () => true,
      () => 0,
      undefined,
      undefined,
      () => true,
      'orca-first',
      () => false,
      () => 0,
      () => false,
      () => canSteer
    )

  it('steers on Ctrl+Enter only when the pane can be steered', () => {
    expect(resolve(true)).toEqual({ type: 'steerAgent' })
    expect(resolve(false)).toEqual({ type: 'sendInput', data: '\r' })
  })
})
