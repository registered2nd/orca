import { skipOpenEscapeContinuation } from '../../../../../shared/terminal-partial-escape-tail'

import type { ConnectPanePtySession } from './connect-pane-pty-session'

/** Skip a post-gap chunk's continuation of an escape whose start main dropped, unless a replay re-armed that escape in xterm (#33766). */
export function skipGapEscapeContinuation(
  session: ConnectPanePtySession,
  data: string,
  gapEscapeState: string | undefined
): string {
  if (gapEscapeState && !session.idleCursorReset.insideEscape) {
    session.gapEscapeContinuation = gapEscapeState
  }
  if (!session.gapEscapeContinuation) {
    return data
  }
  const skipped = skipOpenEscapeContinuation(session.gapEscapeContinuation, data)
  session.gapEscapeContinuation = skipped.stillOpen
  return skipped.rest
}
