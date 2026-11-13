/** A hidden mark can outlive the claim that set it; a pane the focused window shows must still get its output. */
import { redactPtyIdForDiagnostics } from '../../../../shared/terminal/pty/diagnostics/pty-delivery-diagnostics'
import { mainDeliveryBreadcrumbs } from './debug'
import { sendModelRestoreNeededMarker } from './payload'
import { invalidatePendingPtyDrainPolicy, visibleRendererPtys } from './visibility-state'
import type { PtyIpcSession } from '../session'

/**
 * Clears a stale hidden mark at the moment it would drop output for a pane the window reports visible.
 * Why focus: a visible pane keeps a rightful hidden claim while its document is hidden (minimized or
 * occluded), and the focused window's document never is. The dropped chunk stays dropped; the unhide
 * marker has the pane repaint from main's snapshot, which already holds it.
 */
export function revealHiddenPtyShownInFocusedWindow(
  session: PtyIpcSession,
  id: string,
  markerSeq: number | undefined
): boolean {
  const { mainWindow } = session
  if (
    !visibleRendererPtys.has(id) ||
    !mainWindow ||
    mainWindow.isDestroyed() ||
    !mainWindow.isFocused()
  ) {
    return false
  }
  mainDeliveryBreadcrumbs.record('gate-unmark-shown', { id: redactPtyIdForDiagnostics(id) })
  const transition = session.transitionHiddenRendererPtyDeliveryState(id, false)
  if (transition.policyChanged) {
    invalidatePendingPtyDrainPolicy(id)
  }
  session.syncPtyBackgroundedDelivery(id, 'gate-unmark')
  if (transition.droppedWhileHidden) {
    sendModelRestoreNeededMarker(session, id, 'unhide', markerSeq, transition.hiddenDropEpisode)
  }
  return true
}
