import type * as WorktreeScanCacheModule from '../../../git/worktrees/catalog/worktree-scan-cache'
import type * as WorktreeListingModule from '../../../git/worktrees/catalog/worktree-listing'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAgentPromptSubmissionRuntime } from './agent-prompt-submission-runtime-test-fixture'

const worktrees = vi.hoisted(() => [
  {
    path: '/tmp/worktree-a',
    head: 'abc',
    branch: 'feature/queued-receipt',
    isBare: false,
    isMainWorktree: false
  }
])

vi.mock('../../../git/worktrees/catalog/worktree-scan-cache', async (importOriginal) => ({
  ...(await importOriginal<typeof WorktreeScanCacheModule>()),
  listWorktrees: vi.fn().mockResolvedValue(worktrees)
}))

vi.mock('../../../git/worktrees/catalog/worktree-listing', async (importOriginal) => ({
  ...(await importOriginal<typeof WorktreeListingModule>()),
  listWorktreesStrict: vi.fn().mockResolvedValue(worktrees)
}))

const PTY_ID = 'pty-prompt'
const PROMPT = 'ok go on'
const RULE = '─'.repeat(40)

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

/** A Claude pane whose hooks report a turn in progress; `onEnter` is how it answers Enter. */
async function createMidTurnClaude(
  state: 'working' | 'done',
  onEnter: 'take' | 'swallow'
): Promise<Awaited<ReturnType<typeof createAgentPromptSubmissionRuntime>>> {
  let handle = ''
  const startedAt = Date.now() - 60_000
  const pane = await createAgentPromptSubmissionRuntime(
    (runtime, data) => {
      if (data === '\r') {
        if (onEnter === 'take') {
          runtime.onPtyData(PTY_ID, composerFrame(''), Date.now())
        }
        return
      }
      runtime.onPtyData(PTY_ID, composerFrame(PROMPT), Date.now())
    },
    'claude',
    () => true,
    {
      getAgentStatusSnapshot: () => [
        {
          paneKey: 'busy-pane',
          terminalHandle: handle,
          state,
          prompt: 'earlier task',
          agentType: 'claude',
          connectionId: null,
          receivedAt: Date.now(),
          stateStartedAt: startedAt
        }
      ]
    }
  )
  handle = pane.handle
  pane.runtime.onPtyData(PTY_ID, composerFrame(''), Date.now())
  await pane.runtime.readTerminal(handle, { screen: true })
  return pane
}

async function sendQueuedPrompt(
  pane: Awaited<ReturnType<typeof createAgentPromptSubmissionRuntime>>
): Promise<Awaited<ReturnType<typeof pane.runtime.sendTerminalAgentPrompt>>> {
  vi.useFakeTimers()
  const sent = pane.runtime.sendTerminalAgentPrompt(pane.handle, PROMPT, {
    inputKind: 'driving',
    acceptQueued: true,
    requestId: 'prompt-mid-turn',
    observationTimeoutMs: 0
  })
  await vi.runAllTimersAsync()
  return sent
}

describe('agent prompt sent while the agent is mid-turn', () => {
  afterEach(() => vi.useRealTimers())

  it('reports the prompt queued once the composer empties after Enter', async () => {
    const pane = await createMidTurnClaude('working', 'take')

    const sent = await sendQueuedPrompt(pane)

    expect(sent.prompt?.stages).toEqual(['input_accepted', 'queued'])
    expect(pane.writes.at(-1)).toBe('\r')
  })

  it('keeps the receipt at input_accepted while the composer still holds the prompt', async () => {
    const pane = await createMidTurnClaude('working', 'swallow')

    const sent = await sendQueuedPrompt(pane)

    expect(sent.prompt?.stages).toEqual(['input_accepted'])
  })

  it('does not call an idle agent prompt queued, since its own turn start is owed', async () => {
    const pane = await createMidTurnClaude('done', 'take')

    const sent = await sendQueuedPrompt(pane)

    expect(sent.prompt?.stages).toEqual(['input_accepted'])
  })
})
