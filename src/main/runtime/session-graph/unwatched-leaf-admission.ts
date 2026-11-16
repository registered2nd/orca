import type { RuntimeSyncedLeaf } from '../../../shared/remote-runtime/session-graph/runtime-session-contracts'
import type { PtyLivenessVerdict } from '../../../shared/terminal/pty/lifecycle/pty-liveness-verdict'

/** An unwatched leaf is an unmounted pane the window cannot vouch for; only main's own running PTY keeps it. */
export function admitUnwatchedLeavesMainRuns(
  leaves: readonly RuntimeSyncedLeaf[],
  controllerKnowsPtyIsLive: (ptyId: string) => boolean,
  liveness: { getPtyLivenessVerdict(ptyId: string): PtyLivenessVerdict | null }
): RuntimeSyncedLeaf[] {
  return leaves.filter(
    (leaf) =>
      !leaf.unwatched ||
      (leaf.ptyId !== null &&
        controllerKnowsPtyIsLive(leaf.ptyId) &&
        liveness.getPtyLivenessVerdict(leaf.ptyId)?.status !== 'exited')
  )
}
