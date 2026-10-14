import { useCallback } from 'react'
import type { GrabIntent } from '../../../../../shared/browser/element-grab/browser-grab-types'
import type { GrabModeHook } from '../annotate/grab/useGrabMode'
import type { BrowserPageGrabAnnotations } from '../describe-page/browser-page-types'

/** The picker's intents plus Ask's, which the picker hook has no lines left for. */
export function useBrowserAskIntent(
  annotations: BrowserPageGrabAnnotations,
  grab: GrabModeHook
): BrowserPageGrabAnnotations {
  const { grabIntent, setGrabIntent, startGrabIntent } = annotations
  const startGrabOrAskIntent = useCallback(
    (nextIntent: GrabIntent): void => {
      // Ask opens unarmed so text can be highlighted; its toolbar button toggles the panel.
      if (nextIntent === 'ask') {
        grab.cancel()
        setGrabIntent(grabIntent === 'ask' ? 'copy' : 'ask')
        return
      }
      startGrabIntent(nextIntent)
    },
    [grab, grabIntent, setGrabIntent, startGrabIntent]
  )
  return { ...annotations, startGrabIntent: startGrabOrAskIntent }
}
