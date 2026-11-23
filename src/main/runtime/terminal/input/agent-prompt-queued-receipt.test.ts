import { afterEach, describe, expect, it, vi } from 'vitest'
import { OrcaRuntimeService } from '../../orca-runtime'

const PTY_ID = 'pty-prompt'
const RULE = '─'.repeat(40)

type Pane = { runtime: OrcaRuntimeService; handle: string; writes: string[] }
type Hook = { state: 'working' | 'done'; stateStartedAt: number }
/** How the pane answers Enter: take the prompt out of the composer, or leave it there. */
type OnEnter = 'take' | 'swallow'

/** Claude Code's framed composer holding `text`, with the cursor at the end of it. */
function composerFrame(text: string): string {
  return [
    '\x1b[2J\x1b[H',
    '✻ Working… (esc to interrupt)\r\n',
    `${RULE}\r\n`,
    `❯ ${text}\r\n`,
    `${RULE}\r\n`,
    '  ? for shortcuts',
    `\x1b[3;${3 + text.length}H`
  ].join('')
}

/** A store-less runtime with Claude Code in its one PTY's foreground; every write goes to `onWrite`. */
async function createClaudeRuntime(
  onWrite: (runtime: OrcaRuntimeService, data: string) => void,
  runtimeDeps: ConstructorParameters<typeof OrcaRuntimeService>[2]
): Promise<Pane> {
  const runtime = new OrcaRuntimeService(undefined, undefined, runtimeDeps)
  const writes: string[] = []
  runtime.setPtyController({
    write: (_ptyId: string, data: string) => {
      writes.push(data)
      onWrite(runtime, data)
      return true
    },
    kill: () => true,
    getForegroundProcess: async () => 'claude',
    getSize: () => ({ cols: 100, rows: 30 })
  })
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the protected handle issue a registered terminal goes through; no public seam exists.
  const internals = runtime as unknown as {
    issuePtyHandle: (pty: unknown) => void
    ptysById: Map<string, unknown>
    handles: Map<string, unknown>
  }
  runtime.registerPty(PTY_ID, 'wt-1')
  internals.issuePtyHandle(internals.ptysById.get(PTY_ID))
  const [handle] = internals.handles.keys()
  // The host reports Claude Code in the foreground, which makes it the send's settling agent.
  await runtime.refreshPtyForegroundAgentFromController(PTY_ID)
  return { runtime, handle, writes }
}

/** A Claude pane whose hooks report `hook`; each Enter runs `enter.onEnter`. */
async function createClaudePane(
  hook: Hook,
  enter: { onEnter: OnEnter; startsTurn?: boolean }
): Promise<Pane> {
  let handle = ''
  let typed = ''
  const rows = () => [
    {
      paneKey: 'busy-pane',
      terminalHandle: handle,
      state: hook.state,
      prompt: 'earlier task',
      agentType: 'claude',
      connectionId: null,
      receivedAt: Date.now(),
      stateStartedAt: hook.stateStartedAt
    }
  ]
  const pane = await createClaudeRuntime(
    (runtime, data) => {
      if (data !== '\r') {
        typed = data.replaceAll('\x1b[200~', '').replaceAll('\x1b[201~', '')
        runtime.onPtyData(PTY_ID, composerFrame(typed), Date.now())
        return
      }
      if (enter.onEnter === 'take') {
        runtime.onPtyData(PTY_ID, composerFrame(''), Date.now())
        if (enter.startsTurn) {
          hook.state = 'working'
          hook.stateStartedAt = Date.now()
        }
      }
    },
    { getAgentStatusSnapshot: rows, getPublicAgentStatusSnapshotForPane: rows }
  )
  handle = pane.handle
  pane.runtime.onPtyData(PTY_ID, composerFrame(''), Date.now())
  await pane.runtime.readTerminal(handle, { screen: true })
  return pane
}

async function sendPrompt(
  pane: Pane,
  prompt: string,
  requestId: string,
  observationTimeoutMs = 0
): Promise<Awaited<ReturnType<Pane['runtime']['sendTerminalAgentPrompt']>>> {
  const sent = pane.runtime.sendTerminalAgentPrompt(pane.handle, prompt, {
    inputKind: 'driving',
    acceptQueued: true,
    requestId,
    observationTimeoutMs
  })
  await vi.runAllTimersAsync()
  return sent
}

describe('agent prompt sent while the agent is mid-turn', () => {
  afterEach(() => vi.useRealTimers())

  it('reports the prompt queued once the composer empties after Enter', async () => {
    vi.useFakeTimers()
    const pane = await createClaudePane(
      { state: 'working', stateStartedAt: Date.now() - 60_000 },
      { onEnter: 'take' }
    )

    const sent = await sendPrompt(pane, 'ok go on', 'prompt-mid-turn')

    expect(sent.prompt?.stages).toEqual(['input_accepted', 'queued'])
    expect(pane.writes.at(-1)).toBe('\r')
  })

  it('keeps the receipt at input_accepted while the composer still holds the prompt', async () => {
    vi.useFakeTimers()
    const pane = await createClaudePane(
      { state: 'working', stateStartedAt: Date.now() - 60_000 },
      { onEnter: 'swallow' }
    )

    const sent = await sendPrompt(pane, 'ok go on', 'prompt-mid-turn')

    expect(sent.prompt?.stages).toEqual(['input_accepted'])
  })

  it('does not call an idle agent prompt queued, since its own turn start is owed', async () => {
    vi.useFakeTimers()
    const pane = await createClaudePane(
      { state: 'done', stateStartedAt: Date.now() - 60_000 },
      { onEnter: 'take' }
    )

    const sent = await sendPrompt(pane, 'ok go on', 'prompt-idle')

    expect(sent.prompt?.stages).toEqual(['input_accepted'])
  })

  it('leaves the next prompt its own turn start after a queued one', async () => {
    vi.useFakeTimers()
    const hook: Hook = { state: 'working', stateStartedAt: Date.now() - 60_000 }
    const enter: { onEnter: OnEnter; startsTurn?: boolean } = { onEnter: 'take' }
    const pane = await createClaudePane(hook, enter)
    const queued = await sendPrompt(pane, 'ok go on', 'prompt-mid-turn')
    expect(queued.prompt?.stages).toEqual(['input_accepted', 'queued'])

    // The running turn ends with the queued prompt taken into it; the next prompt starts a turn.
    hook.state = 'done'
    hook.stateStartedAt = Date.now()
    await vi.advanceTimersByTimeAsync(1_000)
    enter.startsTurn = true
    const next = await sendPrompt(pane, 'and then this', 'prompt-next', 5_000)

    expect(next.prompt?.stages).toEqual(['input_accepted', 'turn_started'])
  })
})
