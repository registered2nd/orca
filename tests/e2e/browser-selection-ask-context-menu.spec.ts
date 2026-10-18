/** E2E coverage for asking an agent about a browser highlight from the page's right-click menu. */

import type { Page } from '@stablyai/playwright-test'
import { expect, test } from './helpers/orca-app'
import { ensureTerminalVisible, waitForSessionReady } from './helpers/store'
import {
  createTerminalBrowserSplit,
  waitForBrowserGuestRegistration
} from './helpers/browser-split-fixture'
import { waitForGuestUrl } from './helpers/browser-split-guest-probes'
import { startBrowserSplitPageServer } from './helpers/browser-split-page-server'

/** Highlights the page's paragraph and returns its center in guest coordinates. */
async function highlightParagraph(
  page: Page,
  browserTabId: string
): Promise<{ x: number; y: number }> {
  return page.evaluate(async (tabId) => {
    const webview = document.querySelector<Electron.WebviewTag>(
      `[data-browser-overlay-tab-id="${tabId}"] webview`
    )
    if (!webview) {
      throw new Error('Browser guest unavailable')
    }
    return webview.executeJavaScript(`(() => {
      const paragraph = document.querySelector('p')
      const range = document.createRange()
      range.selectNodeContents(paragraph)
      const selection = window.getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
      const rect = paragraph.getBoundingClientRect()
      return { x: Math.round(rect.left + 20), y: Math.round(rect.top + rect.height / 2) }
    })()`)
  }, browserTabId)
}

async function rightClickInGuest(
  page: Page,
  browserTabId: string,
  point: { x: number; y: number }
): Promise<void> {
  await page.evaluate(
    async ({ tabId, x, y }) => {
      const webview = document.querySelector<Electron.WebviewTag>(
        `[data-browser-overlay-tab-id="${tabId}"] webview`
      )
      if (!webview) {
        throw new Error('Browser guest unavailable')
      }
      await webview.sendInputEvent({ type: 'mouseDown', button: 'right', x, y, clickCount: 1 })
      await webview.sendInputEvent({ type: 'mouseUp', button: 'right', x, y, clickCount: 1 })
    },
    { tabId: browserTabId, ...point }
  )
}

test('right-clicking a browser highlight opens Ask with it attached', async ({ orcaPage }) => {
  await waitForSessionReady(orcaPage)
  await ensureTerminalVisible(orcaPage)
  const server = await startBrowserSplitPageServer()
  try {
    const url = server.pageUrl('ask', 1)
    const split = await createTerminalBrowserSplit(orcaPage, url)
    await waitForGuestUrl(orcaPage, split.browserTabId, url)
    await waitForBrowserGuestRegistration(orcaPage, split.browserTabId, split.browserPageId)

    const point = await highlightParagraph(orcaPage, split.browserTabId)
    await rightClickInGuest(orcaPage, split.browserTabId, point)
    const menu = orcaPage.getByTestId('browser-context-menu')
    await expect(menu).toBeVisible()
    await menu.getByRole('menuitem', { name: 'Ask About Selection…' }).click()

    const panel = orcaPage.getByTestId('browser-ask-panel')
    await expect(panel).toBeVisible()
    await expect(panel).toContainText('Split shortcut fixture.')
  } finally {
    await server.close()
  }
})
