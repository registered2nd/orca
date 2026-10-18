/** E2E coverage for asking an agent about text selected in a terminal pane. */

import type { Page } from '@stablyai/playwright-test'
import { test, expect } from './helpers/orca-app'
import { ensureTerminalVisible, waitForSessionReady } from './helpers/store'
import {
  execInTerminal,
  focusActiveTerminalInput,
  waitForActivePanePtyId,
  waitForTerminalOutput
} from './helpers/terminal'
import { openTerminalContextMenu } from './helpers/terminal-pane-title-actions'

const PROBE = 'ask-selection-probe-7731'

async function selectAllInActivePane(page: Page): Promise<void> {
  await page.evaluate(() => {
    const state = window.__store?.getState()
    const tabId = state?.activeTabId
    const manager = tabId ? window.__paneManagers?.get(tabId) : null
    const pane = manager?.getActivePane?.() ?? manager?.getPanes?.()[0] ?? null
    if (!pane) {
      throw new Error('No active terminal pane')
    }
    pane.terminal.selectAll()
  })
}

test('the selection goes into an Ask box from the shortcut and the pane menu', async ({
  orcaPage
}) => {
  await waitForSessionReady(orcaPage)
  await ensureTerminalVisible(orcaPage)
  const ptyId = await waitForActivePanePtyId(orcaPage)
  await execInTerminal(orcaPage, ptyId, `echo ${PROBE}`)
  await waitForTerminalOutput(orcaPage, PROBE)

  const panel = orcaPage.getByTestId('terminal-selection-ask-panel')
  const isMac = await orcaPage.evaluate(() => navigator.userAgent.includes('Mac'))

  await focusActiveTerminalInput(orcaPage)
  await selectAllInActivePane(orcaPage)
  await orcaPage.keyboard.press(isMac ? 'Meta+Shift+A' : 'Alt+Shift+A')
  await expect(panel).toBeVisible()
  await expect(panel).toContainText(PROBE)
  // Typing must land in the question field, not the PTY.
  await expect(panel.locator('textarea')).toBeFocused()
  await orcaPage.keyboard.type('what is this?')
  await expect(panel.locator('textarea')).toHaveValue('what is this?')
  await expect(panel).toContainText('Click into an agent terminal first')
  await orcaPage.keyboard.press('Escape')
  await expect(panel).toBeHidden()

  await selectAllInActivePane(orcaPage)
  await openTerminalContextMenu(orcaPage)
  await orcaPage.getByRole('menuitem', { name: 'Ask About Selection…' }).click()
  await expect(panel).toBeVisible()
  await expect(panel).toContainText(PROBE)
  await expect(panel.locator('textarea')).toBeFocused()
})
