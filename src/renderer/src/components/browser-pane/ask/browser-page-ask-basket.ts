import { createBrowserUuid } from '@/lib/browser-uuid'
import type { BrowserGrabPayload } from '../../../../../shared/browser-grab-types'

export type BrowserAskItem =
  | { id: string; kind: 'element'; payload: BrowserGrabPayload }
  | { id: string; kind: 'text'; text: string }
  | { id: string; kind: 'page'; text: string }

// Why: the basket outlives the picker re-arming and the panel remounting, and is per browser page.
const basketByPageId = new Map<string, readonly BrowserAskItem[]>()
const listeners = new Set<() => void>()
const EMPTY: readonly BrowserAskItem[] = []

function publish(pageId: string, items: readonly BrowserAskItem[]): void {
  if (items.length === 0) {
    basketByPageId.delete(pageId)
  } else {
    basketByPageId.set(pageId, items)
  }
  for (const listener of listeners) {
    listener()
  }
}

export function getAskBasket(pageId: string): readonly BrowserAskItem[] {
  return basketByPageId.get(pageId) ?? EMPTY
}

export function subscribeAskBasket(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function addAskItem(pageId: string, item: BrowserAskItem): void {
  publish(pageId, [...getAskBasket(pageId), item])
}

export function removeAskItem(pageId: string, id: string): void {
  publish(
    pageId,
    getAskBasket(pageId).filter((item) => item.id !== id)
  )
}

export function clearAskBasket(pageId: string): void {
  publish(pageId, EMPTY)
}

export function createAskItemId(): string {
  return createBrowserUuid()
}
