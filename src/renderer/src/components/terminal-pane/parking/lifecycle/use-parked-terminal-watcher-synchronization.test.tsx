// @vitest-environment happy-dom
import { memo } from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TerminalTab } from '../../../../../../shared/workspace-layout/terminal-tab-types'

vi.mock('../output-watchers/terminal-parked-tab-watchers', () => ({
  syncParkedTerminalTabWatchers: vi.fn()
}))
vi.mock('../output-watchers/terminal-parked-watcher-registry', () => ({
  disposeParkedTerminalWatchersForWorktree: vi.fn()
}))

import { syncParkedTerminalTabWatchers } from '../output-watchers/terminal-parked-tab-watchers'
import { invalidateTerminalParkingInputs } from '../terminal-parking-input-events'
import { useParkedTerminalWatcherSynchronization } from './use-parked-terminal-watcher-synchronization'

const WORKTREE_ID = 'wt-1'

type HostProps = {
  terminalTabs: readonly TerminalTab[]
  parkedTabIds: ReadonlySet<string>
  activationDeferredMountTabIds: ReadonlySet<string> | null
}

// The real caller, TerminalPaneOverlayLayer, is memoized; a plain host hides a callback that memo() leaves stale.
const MemoizedHost = memo(function MemoizedHost(props: HostProps) {
  useParkedTerminalWatcherSynchronization({ worktreeId: WORKTREE_ID, ...props })
  return null
})

function terminalTab(id: string): TerminalTab {
  return { id, ptyId: `${WORKTREE_ID}@@session-${id}` } as TerminalTab
}

function lastSync() {
  return vi.mocked(syncParkedTerminalTabWatchers).mock.calls.at(-1)?.[0]
}

describe('useParkedTerminalWatcherSynchronization in a memoized host', () => {
  afterEach(() => {
    // Unmount first: a host left mounted stays subscribed to the workspace's parking inputs.
    cleanup()
    vi.mocked(syncParkedTerminalTabWatchers).mockClear()
  })

  it('syncs watchers with the verdict of the latest render once a deferred tab is revealed', () => {
    const tabs = [terminalTab('tab-1'), terminalTab('tab-2')]
    const deferredAtStartup = new Set(['tab-1', 'tab-2'])
    const view = render(
      <MemoizedHost
        terminalTabs={tabs}
        parkedTabIds={deferredAtStartup}
        activationDeferredMountTabIds={deferredAtStartup}
      />
    )
    expect(lastSync()?.parkedTabIds).toEqual(new Set(['tab-1', 'tab-2']))

    // Revealing tab-1 leaves only tab-2 deferred; a sync that still lists tab-1 keeps its watcher and hidden claim.
    const stillDeferred = new Set(['tab-2'])
    view.rerender(
      <MemoizedHost
        terminalTabs={tabs}
        parkedTabIds={stillDeferred}
        activationDeferredMountTabIds={stillDeferred}
      />
    )

    expect(lastSync()).toEqual({
      worktreeId: WORKTREE_ID,
      tabs,
      parkedTabIds: new Set(['tab-2']),
      restoreTitleOnStartTabIds: new Set(['tab-2'])
    })
  })

  it('starts watchers for tabs parked after the first render', () => {
    const tabs = [terminalTab('tab-1'), terminalTab('tab-2')]
    const view = render(
      <MemoizedHost
        terminalTabs={tabs}
        parkedTabIds={new Set()}
        activationDeferredMountTabIds={null}
      />
    )
    expect(lastSync()?.parkedTabIds).toEqual(new Set())

    view.rerender(
      <MemoizedHost
        terminalTabs={tabs}
        parkedTabIds={new Set(['tab-2'])}
        activationDeferredMountTabIds={null}
      />
    )

    expect(lastSync()?.parkedTabIds).toEqual(new Set(['tab-2']))
  })

  it('reads the current tabs and verdict when only the parking inputs change', () => {
    const parkedTabIds = new Set(['tab-2'])
    const view = render(
      <MemoizedHost
        terminalTabs={[terminalTab('tab-1'), terminalTab('tab-2')]}
        parkedTabIds={new Set()}
        activationDeferredMountTabIds={null}
      />
    )
    const nextTabs = [terminalTab('tab-1'), terminalTab('tab-2'), terminalTab('tab-3')]
    view.rerender(
      <MemoizedHost
        terminalTabs={nextTabs}
        parkedTabIds={parkedTabIds}
        activationDeferredMountTabIds={null}
      />
    )
    vi.mocked(syncParkedTerminalTabWatchers).mockClear()

    act(() => invalidateTerminalParkingInputs(WORKTREE_ID))

    expect(syncParkedTerminalTabWatchers).toHaveBeenCalledTimes(1)
    expect(lastSync()).toMatchObject({ tabs: nextTabs, parkedTabIds })
  })
})
