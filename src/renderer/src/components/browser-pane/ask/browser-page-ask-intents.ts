import { useLayoutEffect, useSyncExternalStore } from 'react'
import { useLatestHandler } from '@/lib/use-latest-handler'
import type { BrowserAskIntent } from './browser-page-ask-send'

type ReadBrowserAskIntent = () => BrowserAskIntent

/** Pages whose pane mounts the Ask panel, so the page's right-click menu can open it. */
const askIntentsByPage = new Map<string, ReadBrowserAskIntent>()
const listeners = new Set<() => void>()

function notifyListeners(): void {
  for (const listener of listeners) {
    listener()
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Offers this pane's Ask intent to the page's right-click menu while the pane is mounted. */
export function useProvideBrowserPageAskIntent(browserPageId: string, ask: BrowserAskIntent): void {
  const readAsk = useLatestHandler(() => ask)
  useLayoutEffect(() => {
    askIntentsByPage.set(browserPageId, readAsk)
    notifyListeners()
    return () => {
      if (askIntentsByPage.get(browserPageId) === readAsk) {
        askIntentsByPage.delete(browserPageId)
        notifyListeners()
      }
    }
  }, [browserPageId, readAsk])
}

/** Reads the Ask intent of the pane showing this page when called; undefined where that pane has no Ask panel. */
export function useBrowserPageAskIntent(browserPageId: string): ReadBrowserAskIntent | undefined {
  return useSyncExternalStore(subscribe, () => askIntentsByPage.get(browserPageId))
}
