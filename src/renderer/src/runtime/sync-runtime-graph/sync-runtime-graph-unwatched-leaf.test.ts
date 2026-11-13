// An unmounted pane no watcher holds still belongs to its tab; main keeps it only while main runs its PTY.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeSyncWindowGraph } from '../../../../shared/remote-runtime/session-graph/runtime-session-contracts'
import { ORCA_LAYOUT_OWNER_IS_MAIN } from '../../../../shared/layout-owner-switch'
import type { AppState } from '../../store/types'
import type { TerminalTab } from '../../../../shared/workspace-layout/terminal-tab-types'
import { makeState } from './testing/sync-runtime-graph-test-harness'

vi.mock(
  '@/components/terminal-pane/pty-transport/delivery/pty-dispatcher',
  async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>()
    return { ...actual, getEagerPtyBufferHandle: vi.fn(() => undefined) }
  }
)

import { getEagerPtyBufferHandle } from '@/components/terminal-pane/pty-transport/delivery/pty-dispatcher'
import {
  bufferPreHandlerPtyExit,
  clearPreHandlerPtyState
} from '@/components/terminal-pane/pty-transport/delivery/pty-pre-handler-buffer'
import { parkedWatchersByTabId } from '@/components/terminal-pane/parking/output-watchers/terminal-parked-watcher-registry'
import { setRuntimeGraphStoreStateGetter, setRuntimeGraphSyncEnabled } from './graph-sync-scheduler'

const LEAF = '22222222-2222-4222-8222-222222222222'
const PARKED_PTY = 'wt-1::/tmp/wt@@parked-pty'
const TAB_ID = 'parked-tab-1'

function parkedState(): AppState {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the publication reads only these tab fields.
  const tab = {
    id: TAB_ID,
    ptyId: PARKED_PTY,
    worktreeId: 'wt-1',
    title: 'agent',
    customTitle: null,
    color: null,
    sortOrder: 0,
    createdAt: 1
  } as TerminalTab
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: a single-leaf saved layout, as parking leaves it.
  const terminalLayoutsByTabId = {
    [TAB_ID]: {
      root: { type: 'leaf', leafId: LEAF },
      activeLeafId: LEAF,
      expandedLeafId: null,
      ptyIdsByLeafId: { [LEAF]: PARKED_PTY }
    }
  } as unknown as AppState['terminalLayoutsByTabId']
  return makeState({ tabsByWorktree: { 'wt-1': [tab] }, terminalLayoutsByTabId })
}

/** Installs the registry state the park wiring leaves behind on unmount. */
function installParkedWatcher(ptyId: string): void {
  parkedWatchersByTabId.set(TAB_ID, {
    worktreeId: 'wt-1',
    tabPtyId: ptyId,
    paneIdByPtyId: new Map([[ptyId, 1]]),
    disposersByPtyId: new Map([[ptyId, () => {}]])
  })
}

afterEach(() => {
  setRuntimeGraphSyncEnabled(false)
  setRuntimeGraphStoreStateGetter(null)
  parkedWatchersByTabId.clear()
  clearPreHandlerPtyState(PARKED_PTY)
  vi.mocked(getEagerPtyBufferHandle).mockReturnValue(undefined)
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function captureGraph(): Promise<RuntimeSyncWindowGraph> {
  vi.useFakeTimers()
  const syncWindowGraph = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('window', { api: { runtime: { syncWindowGraph } } })
  vi.stubGlobal('HTMLElement', class HTMLElement {})
  setRuntimeGraphStoreStateGetter(() => parkedState())
  setRuntimeGraphSyncEnabled(true)
  await vi.advanceTimersByTimeAsync(20)
  await Promise.resolve()
  await Promise.resolve()
  expect(syncWindowGraph).toHaveBeenCalledTimes(1)
  return syncWindowGraph.mock.calls[0]?.[0] as RuntimeSyncWindowGraph
}

/** With the switch on, main lists this app's panes and the window reports only what it shows or parks. */
function reportedPanes(graph: RuntimeSyncWindowGraph): Record<string, unknown>[] {
  return ORCA_LAYOUT_OWNER_IS_MAIN ? (graph.mountedLeaves ?? []) : graph.leaves
}

describe('syncRuntimeGraph unwatched parked panes', () => {
  it('reports a watched parked pane without the unwatched flag', async () => {
    installParkedWatcher(PARKED_PTY)

    const graph = await captureGraph()

    expect(reportedPanes(graph)).toContainEqual(
      expect.objectContaining({ tabId: TAB_ID, leafId: LEAF, parked: true })
    )
    expect(reportedPanes(graph)).not.toContainEqual(expect.objectContaining({ unwatched: true }))
  })

  it('publishes an unmounted pane no watcher holds as unwatched, so main can keep its live PTY', async () => {
    const graph = await captureGraph()

    if (ORCA_LAYOUT_OWNER_IS_MAIN) {
      // Main lists this app's panes itself; the window reports only what it parks with a watcher.
      expect(reportedPanes(graph)).not.toContainEqual(expect.objectContaining({ tabId: TAB_ID }))
      return
    }
    expect(graph.leaves).toContainEqual(
      expect.objectContaining({
        tabId: TAB_ID,
        leafId: LEAF,
        ptyId: PARKED_PTY,
        parked: true,
        unwatched: true
      })
    )
    expect(graph.tabs).toContainEqual(
      expect.objectContaining({ tabId: TAB_ID, activeLeafId: LEAF })
    )
  })

  it('drops an unwatched pane whose PTY exit is buffered', async () => {
    bufferPreHandlerPtyExit(PARKED_PTY, 0)

    const graph = await captureGraph()

    expect(reportedPanes(graph)).not.toContainEqual(expect.objectContaining({ tabId: TAB_ID }))
  })
})
