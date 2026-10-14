import { useCallback } from 'react'
import type { GrabIntent } from '../../../../../shared/browser/element-grab/browser-grab-types'
import type { GrabModeHook } from '../annotate/grab/useGrabMode'
import type { BrowserPageGrabAnnotations } from '../describe-page/browser-page-types'

/** The picker's intents plus Ask's: a second press on Ask's button closes its panel. */
export function useBrowserAskIntent(
  annotations: BrowserPageGrabAnnotations,
  grab: GrabModeHook
): BrowserPageGrabAnnotations {
  const { grabIntent, setGrabIntent, startGrabIntent } = annotations
  const startGrabOrAskIntent = useCallback(
    (nextIntent: GrabIntent): void => {
      if (nextIntent === 'ask' && grabIntent === 'ask') {
        grab.cancel()
        setGrabIntent('copy')
        return
      }
      startGrabIntent(nextIntent)
    },
    [grab, grabIntent, setGrabIntent, startGrabIntent]
  )
  return { ...annotations, startGrabIntent: startGrabOrAskIntent }
}
