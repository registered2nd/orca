import { translate } from '@/i18n/i18n'
import {
  addAskItem,
  createAskItemId,
  getAskBasket,
  type BrowserAskItem
} from './browser-page-ask-basket'
import { elementText, type AskPromptItem } from './browser-page-ask-prompt'
import type { GrabIntent } from '../describe-page/browser-page-types'

/** Content reads a highlight as text; Elements reads the blocks it covers, for design questions. */
export type AskMode = 'content' | 'elements'

const ASK_MODE_KEY = 'orca.browser.ask-mode'

export function loadAskMode(): AskMode {
  try {
    return window.localStorage.getItem(ASK_MODE_KEY) === 'elements' ? 'elements' : 'content'
  } catch {
    return 'content'
  }
}

export function saveAskMode(mode: AskMode): void {
  try {
    window.localStorage.setItem(ASK_MODE_KEY, mode)
  } catch {
    // Storage unavailable; the mode just won't be remembered.
  }
}

export function chipLabel(item: BrowserAskItem): string {
  if (item.kind === 'page') {
    return translate('auto.components.browser.pane.ask.wholePage', 'Whole page')
  }
  const text = item.kind === 'element' ? elementText(item.payload) : item.text
  const label = text.replace(/\s+/g, ' ').trim()
  const prefix =
    item.kind === 'element'
      ? `<${item.payload.target.tagName.toLowerCase()}> `
      : item.kind === 'elements'
        ? translate('auto.components.browser.pane.ask.elementsChip', 'Elements: ')
        : ''
  return `${prefix}${label.length > 40 ? `${label.slice(0, 40)}…` : label || '…'}`
}

export async function toPromptItem(item: BrowserAskItem): Promise<AskPromptItem> {
  if (item.kind === 'page') {
    const textPath = await window.api.browser
      .askSaveAttachment({ kind: 'text', text: item.text })
      .catch(() => null)
    return { kind: 'page', textPath, text: item.text }
  }
  return item
}

async function readPage(
  browserPageId: string,
  what: 'selection' | 'selection-elements' | 'page'
): Promise<string> {
  const result = await window.api.browser.askReadPage({ browserPageId, what }).catch(() => null)
  return result?.ok ? result.text.trim() : ''
}

/** The current highlight, read the way the mode wants it; null when nothing is highlighted. */
export async function readHighlight(
  browserPageId: string,
  mode: AskMode
): Promise<Extract<BrowserAskItem, { kind: 'text' | 'elements' }> | null> {
  const text = await readPage(
    browserPageId,
    mode === 'elements' ? 'selection-elements' : 'selection'
  )
  if (!text) {
    return null
  }
  return { id: createAskItemId(), kind: mode === 'elements' ? 'elements' : 'text', text }
}

export async function readWholePage(browserPageId: string): Promise<BrowserAskItem | null> {
  const text = await readPage(browserPageId, 'page')
  return text ? { id: createAskItemId(), kind: 'page', text } : null
}

// Why: the live highlight rides along with every send; with nothing at all, "this" is the whole page.
export async function collectSendItems(
  browserPageId: string,
  mode: AskMode,
  items: readonly BrowserAskItem[]
): Promise<readonly BrowserAskItem[]> {
  const highlight = await readHighlight(browserPageId, mode)
  const alreadyKept =
    highlight &&
    items.some(
      (item) => item.kind === highlight.kind && 'text' in item && item.text === highlight.text
    )
  const withHighlight = highlight && !alreadyKept ? [...items, highlight] : items
  if (withHighlight.length > 0) {
    return withHighlight
  }
  const page = await readWholePage(browserPageId)
  return page ? [page] : []
}

export type BrowserAskIntent = {
  grabIntent: GrabIntent
  startGrabIntent: (intent: GrabIntent) => void
}

/** Right-click Ask: opens the panel with the highlight attached, read the way the panel's mode reads it. */
export async function askAboutBrowserSelection(
  browserPageId: string,
  selectionText: string,
  ask: BrowserAskIntent
): Promise<void> {
  if (ask.grabIntent !== 'ask') {
    ask.startGrabIntent('ask')
  }
  const highlight = await readHighlight(browserPageId, loadAskMode())
  const text = selectionText.trim()
  const item = highlight ?? (text ? { id: createAskItemId(), kind: 'text' as const, text } : null)
  const kept = getAskBasket(browserPageId).some(
    (existing) =>
      item && existing.kind === item.kind && 'text' in existing && existing.text === item.text
  )
  if (item && !kept) {
    addAskItem(browserPageId, item)
  }
}
