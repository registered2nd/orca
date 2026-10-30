// A desktop paired to a windowed Orca must follow it through a reboot: terminals and agents the
// server dropped leave the desktop, including agents the server restored and then closed.
import type { Page } from '@stablyai/playwright-test'
import { RuntimeClient } from '../../src/cli/runtime/client'
import { decodePairingOffer, encodePairingOffer } from '../../src/shared/pairing'
import type { RuntimeMobileSessionTabsResult } from '../../src/shared/runtime-types'
import type { RuntimeTerminalCreate } from '../../src/shared/runtime-terminal-contracts'
import { toHostSessionPaneKey } from '../../src/shared/terminal-surface-id'
import { expect, test } from './helpers/orca-app'
import { attachRepoAndOpenTerminal, createRestartSession } from './helpers/orca-restart'
import {
  createRuntimeDesktopPairingOffer,
  launchPairedElectronClient,
  type PairedElectronClient
} from './helpers/paired-electron-client'
import { startFreezableTcpProxy } from './helpers/freezable-tcp-proxy'
import { emitCodexHookStatus, readHookEndpoint } from './helpers/agent-hook-endpoint'
import { cleanupE2EDaemons } from './helpers/electron-process-shutdown'
import { selectPairedWorktreeGroup } from './helpers/client-hosted-browser-fixture'

/** Terminal titles, and the server tab ids of agent and retained-agent rows. */
type View = { tabs: string[]; agents: string[]; retained: string[] }

async function readDesktopView(page: Page, worktreeId: string): Promise<View> {
  const raw = await page.evaluate((id) => {
    const state = window.__store!.getState()
    const tabs = (state.tabsByWorktree[id] ?? []) as {
      id: string
      title: string
      customTitle: string | null
    }[]
    const tabIds = new Set(tabs.map((tab) => tab.id))
    // Retained rows nest the entry; both name their worktree, or at least a tab in it.
    const forWorktree = (record: Record<string, unknown>): string[] =>
      Object.entries(record)
        .filter(([paneKey, entry]) => {
          const value = entry as { worktreeId?: string; entry?: { worktreeId?: string } }
          return (
            (value.worktreeId ?? value.entry?.worktreeId) === id ||
            tabIds.has(paneKey.split(':')[0]!)
          )
        })
        .map(([paneKey]) => paneKey)
    return {
      tabs: tabs.map((tab) => tab.customTitle ?? tab.title),
      agents: forWorktree(state.agentStatusByPaneKey),
      retained: forWorktree(state.retainedAgentsByPaneKey)
    }
  }, worktreeId)
  // The desktop mirrors a server pane as web-terminal-<server tab>; decode back to compare.
  const serverTab = (paneKey: string): string => toHostSessionPaneKey(paneKey).split(':')[0]!
  return {
    tabs: raw.tabs.sort(),
    agents: raw.agents.map(serverTab).sort(),
    retained: raw.retained.map(serverTab).sort()
  }
}

async function readServerView(server: RuntimeClient, worktree: string): Promise<View> {
  const listed = await server.call<RuntimeMobileSessionTabsResult>('session.tabs.list', {
    worktree
  })
  const terminals = listed.result.tabs.flatMap((tab) => (tab.type === 'terminal' ? [tab] : []))
  return {
    tabs: terminals.map((tab) => tab.title ?? tab.parentTabId).sort(),
    agents: terminals.flatMap((tab) => (tab.agentStatus ? [tab.parentTabId] : [])).sort(),
    retained: []
  }
}

async function createFinishedWorker(
  server: RuntimeClient,
  app: Parameters<typeof readHookEndpoint>[0],
  worktreeId: string,
  title: string
): Promise<RuntimeTerminalCreate> {
  const worker = (
    await server.call<{ terminal: RuntimeTerminalCreate }>('terminal.create', {
      worktree: `id:${worktreeId}`,
      title
    })
  ).result.terminal
  const hooks = await readHookEndpoint(app)
  for (const state of ['working', 'done'] as const) {
    await emitCodexHookStatus(hooks, {
      paneKey: worker.paneKey!,
      worktreeId,
      state,
      ...(state === 'working' ? { prompt: 'do the job' } : { lastAssistantMessage: 'done' })
    })
  }
  return worker
}

async function openServerWorkspace(client: PairedElectronClient, worktreeId: string) {
  await expect
    .poll(
      () =>
        client.page.evaluate(
          (id) =>
            window
              .__store!.getState()
              .allWorktrees()
              .some((worktree: { id: string }) => worktree.id === id),
          worktreeId
        ),
      { timeout: 120_000, message: 'the desktop never listed the server workspace' }
    )
    .toBe(true)
  await selectPairedWorktreeGroup(client.page, client.environmentId, worktreeId)
}

async function rebootServer(
  session: ReturnType<typeof createRestartSession>,
  app: Parameters<ReturnType<typeof createRestartSession>['close']>[0]
) {
  // The terminal host ends with the machine, so agents come back restored, not running.
  await session.close(app)
  await cleanupE2EDaemons(session.userDataDir)
  const relaunched = await session.launch()
  await relaunched.page.waitForFunction(
    () => window.__store?.getState().workspaceSessionReady === true,
    null,
    { timeout: 60_000 }
  )
  return relaunched
}

test('a paired desktop drops what a windowed server closed while the link was down and it rebooted', async ({
  testRepoPath
}, testInfo) => {
  test.setTimeout(480_000)
  const session = createRestartSession(testInfo)
  let { app, page } = await session.launch()
  const server = new RuntimeClient(session.userDataDir, 10_000)
  await attachRepoAndOpenTerminal(page, testRepoPath)
  const offer = decodePairingOffer((await createRuntimeDesktopPairingOffer(page)).pairingUrl)
  if (!('endpoint' in offer)) {
    throw new Error('expected a direct pairing offer')
  }
  const endpoint = new URL(offer.endpoint)
  const link = await startFreezableTcpProxy(endpoint.hostname, Number(endpoint.port))
  endpoint.port = String(link.port)
  let client: PairedElectronClient | null = null
  try {
    client = await launchPairedElectronClient(
      { pairingUrl: encodePairingOffer({ ...offer, endpoint: endpoint.toString() }) },
      testInfo,
      'windowed server'
    )
    const desktop = client
    const worktreeId = await page.evaluate(() => window.__store!.getState().activeWorktreeId!)
    const worktree = `id:${worktreeId}`
    await openServerWorkspace(desktop, worktreeId)
    await server.call('terminal.create', { worktree, title: 'keep' })
    const doomed = await createFinishedWorker(server, app, worktreeId, 'doomed')
    await expect
      .poll(async () => (await readDesktopView(desktop.page, worktreeId)).agents, {
        timeout: 60_000
      })
      .toContain(doomed.tabId!)

    // The link drops (a sleeping laptop, a relay outage) while the server closes a terminal and reboots.
    link.cut('silent')
    await server.call('terminal.closeTab', { terminal: doomed.handle })
    ;({ app, page } = await rebootServer(session, app))
    link.restore()

    await expect
      .poll(
        async () => {
          const [view, serverView] = await Promise.all([
            readDesktopView(desktop.page, worktreeId),
            readServerView(server, worktree)
          ])
          return { ...view, matchesServer: view.tabs.join('\n') === serverView.tabs.join('\n') }
        },
        { timeout: 120_000, message: 'the desktop never caught up with the rebooted server' }
      )
      .toMatchObject({ retained: [], matchesServer: true })
    const settled = await readDesktopView(desktop.page, worktreeId)
    expect(settled.tabs).not.toContain('doomed')
    expect(settled.agents).not.toContain(doomed.tabId!)
  } finally {
    await client?.dispose()
    await link.close()
    await session.dispose(app)
  }
})

test('a desktop paired to a rebooted windowed server drops a restored agent the server closes', async ({
  testRepoPath
}, testInfo) => {
  test.setTimeout(480_000)
  const session = createRestartSession(testInfo)
  let { app, page } = await session.launch()
  const server = new RuntimeClient(session.userDataDir, 10_000)
  let client: PairedElectronClient | null = null
  try {
    await attachRepoAndOpenTerminal(page, testRepoPath)
    const worktreeId = await page.evaluate(() => window.__store!.getState().activeWorktreeId!)
    const worktree = `id:${worktreeId}`
    const worker = await createFinishedWorker(server, app, worktreeId, 'finished worker')
    ;({ app, page } = await rebootServer(session, app))
    await expect
      .poll(async () => (await readServerView(server, worktree)).agents, { timeout: 60_000 })
      .toContain(worker.tabId!)

    client = await launchPairedElectronClient(
      await createRuntimeDesktopPairingOffer(page),
      testInfo,
      'rebooted windowed server'
    )
    const desktop = client
    await openServerWorkspace(desktop, worktreeId)
    await expect
      .poll(async () => (await readDesktopView(desktop.page, worktreeId)).agents, {
        timeout: 60_000
      })
      .toContain(worker.tabId!)

    // The server closes the finished worker, as an orchestrator closing a done worker does.
    await server.call('session.tabs.close', {
      worktree,
      tabId: worker.tabId!,
      reason: 'user',
      force: true
    })
    await expect
      .poll(async () => (await readServerView(server, worktree)).tabs, { timeout: 30_000 })
      .not.toContain('finished worker')

    // Long enough for the desktop's retention to turn a vanished agent into a retained row.
    await new Promise((resolve) => setTimeout(resolve, 5_000))
    expect(await readDesktopView(desktop.page, worktreeId)).toEqual(
      await readServerView(server, worktree)
    )
  } finally {
    await client?.dispose()
    await session.dispose(app)
  }
})
