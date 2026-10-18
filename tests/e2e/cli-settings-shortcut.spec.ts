/** E2E coverage for `orca settings` and `orca shortcut` changing the running app. */

import { test, expect } from './helpers/orca-app'
import { runCompiledOrcaCli } from './helpers/compiled-orca-cli'
import { ensureTerminalVisible, waitForSessionReady } from './helpers/store'
import {
  execInTerminal,
  focusActiveTerminalInput,
  waitForActivePanePtyId,
  waitForTerminalOutput
} from './helpers/terminal'

const PROBE = 'cli-shortcut-probe-4410'

test('the CLI changes a setting and rebinds a shortcut in the running app', async ({
  electronApp,
  orcaPage
}) => {
  await waitForSessionReady(orcaPage)
  await ensureTerminalVisible(orcaPage)
  const userData = await electronApp.evaluate(({ app }) => app.getPath('userData'))

  const setting = await runCompiledOrcaCli(userData, [
    'settings',
    'set',
    '--terminal-right-click-paste',
    'off',
    '--json'
  ])
  expect(setting.json?.result).toEqual({ terminalRightClickToPaste: false })
  await expect
    .poll(() =>
      orcaPage.evaluate(() => window.__store?.getState().settings?.terminalRightClickToPaste)
    )
    .toBe(false)

  const conflict = await runCompiledOrcaCli(userData, [
    'shortcut',
    'set',
    '--action',
    'terminal.askAboutSelection',
    '--keys',
    'Alt+Shift+D',
    '--json'
  ])
  expect(conflict.json?.ok).toBe(false)

  const rebound = await runCompiledOrcaCli(userData, [
    'shortcut',
    'set',
    '--action',
    'terminal.askAboutSelection',
    '--keys',
    'Alt+Shift+K',
    '--json'
  ])
  expect(rebound.json?.result).toMatchObject({ bindings: ['Alt+Shift+K'], customized: true })

  const ptyId = await waitForActivePanePtyId(orcaPage)
  await execInTerminal(orcaPage, ptyId, `echo ${PROBE}`)
  await waitForTerminalOutput(orcaPage, PROBE)
  await focusActiveTerminalInput(orcaPage)
  await orcaPage.evaluate(() => {
    const tabId = window.__store?.getState().activeTabId
    const manager = tabId ? window.__paneManagers?.get(tabId) : null
    manager?.getActivePane?.()?.terminal.selectAll()
  })
  const panel = orcaPage.getByTestId('terminal-selection-ask-panel')
  await expect
    .poll(async () => {
      await orcaPage.keyboard.press('Alt+Shift+K')
      return panel.isVisible()
    })
    .toBe(true)

  const reset = await runCompiledOrcaCli(userData, [
    'shortcut',
    'set',
    '--action',
    'terminal.askAboutSelection',
    '--reset',
    '--json'
  ])
  expect(reset.json?.result).toMatchObject({ customized: false })
})
