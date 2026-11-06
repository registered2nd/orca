import { resolveTerminalCloseRoute } from '@/lib/terminal-close-route'
import type { TerminalTabRetirementState } from '@/store/slices/terminal-tab-retirement'

/** A paired server's tab mirrors that server's terminal, and closing it stops the terminal there. */
export function isPairedServerTerminal(
  state: TerminalTabRetirementState,
  worktreeId: string,
  tabId: string
): boolean {
  return Boolean(resolveTerminalCloseRoute(state, worktreeId, tabId)?.runtimeEnvironmentId)
}
