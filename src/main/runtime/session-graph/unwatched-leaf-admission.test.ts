import { describe, expect, it } from 'vitest'
import type { RuntimeSyncedLeaf } from '../../../shared/remote-runtime/session-graph/runtime-session-contracts'
import type { PtyLivenessVerdict } from '../../../shared/terminal/pty/lifecycle/pty-liveness-verdict'
import { admitUnwatchedLeavesMainRuns } from './unwatched-leaf-admission'

function leaf(leafId: string, ptyId: string | null, unwatched?: boolean): RuntimeSyncedLeaf {
  return { tabId: `tab-${leafId}`, worktreeId: 'wt', leafId, paneRuntimeId: 1, ptyId, unwatched }
}

function admittedLeafIds(
  leaves: RuntimeSyncedLeaf[],
  runningPtyIds: string[],
  verdicts: Record<string, PtyLivenessVerdict> = {}
): string[] {
  return admitUnwatchedLeavesMainRuns(leaves, (ptyId) => runningPtyIds.includes(ptyId), {
    getPtyLivenessVerdict: (ptyId) => verdicts[ptyId] ?? null
  }).map((admitted) => admitted.leafId)
}

describe('admitUnwatchedLeavesMainRuns', () => {
  it('keeps an unwatched pane under its tab while main runs its PTY', () => {
    expect(admittedLeafIds([leaf('a', 'pty-a', true)], ['pty-a'])).toEqual(['a'])
  })

  it('drops an unwatched pane whose PTY main does not run', () => {
    expect(admittedLeafIds([leaf('a', 'pty-a', true), leaf('b', null, true)], [])).toEqual([])
  })

  it('drops an unwatched pane whose PTY has exited', () => {
    const exited: PtyLivenessVerdict = { status: 'exited' }
    expect(admittedLeafIds([leaf('a', 'pty-a', true)], ['pty-a'], { 'pty-a': exited })).toEqual([])
  })

  it('leaves watched panes to the window', () => {
    expect(admittedLeafIds([leaf('a', 'pty-a'), leaf('b', null)], [])).toEqual(['a', 'b'])
  })
})
