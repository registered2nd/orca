import { describe, expect, it, vi } from 'vitest'
import type { AppIpcHost } from './app-ipc-host'
import { invokeRendererAction, loadAllRendererTerminals } from './renderer-app-actions'

function hostAnswering(
  answer: (operation: string, args: readonly string[]) => unknown
): AppIpcHost {
  return {
    listChannels: () => [],
    invoke: vi.fn(),
    callRenderer: async (operation, args) => JSON.stringify(answer(operation, args))
  }
}

const tab = (tabId: string, loaded: boolean) => ({ tabId, worktreeId: 'wt', loaded })

describe('loadAllRendererTerminals', () => {
  it('waits until every requested tab has attached', async () => {
    let polls = 0
    const host = hostAnswering((operation) => {
      if (operation === 'loadTerminals') {
        return {
          workspaceSessionReady: true,
          requestedWorktreeIds: ['wt'],
          unloadedTabIds: ['a', 'b'],
          totalTabs: 3
        }
      }
      polls += 1
      return [tab('a', true), tab('b', polls > 1), tab('c', true)]
    })
    const outcome = await loadAllRendererTerminals(host, 10_000, async () => {})
    expect(outcome.stillUnloadedTabIds).toEqual([])
    expect(polls).toBe(2)
  })

  it('reports tabs that never attach once the wait runs out', async () => {
    const host = hostAnswering((operation) =>
      operation === 'loadTerminals'
        ? {
            workspaceSessionReady: true,
            requestedWorktreeIds: ['wt'],
            unloadedTabIds: ['a'],
            totalTabs: 1
          }
        : [tab('a', false)]
    )
    const outcome = await loadAllRendererTerminals(host, 0, async () => {})
    expect(outcome.stillUnloadedTabIds).toEqual(['a'])
  })
})

describe('invokeRendererAction', () => {
  it('refuses a name the window does not have and passes arguments as JSON', async () => {
    const calls: (readonly string[])[] = []
    const host = hostAnswering((operation, args) => {
      if (operation === 'list') {
        return { actions: [{ name: 'setActiveTab', arity: 1 }], stateKeys: [] }
      }
      calls.push(args)
      return null
    })
    await expect(invokeRendererAction(host, 'nope', [])).rejects.toThrow(
      "No renderer action named 'nope'"
    )
    await expect(invokeRendererAction(host, 'setActiveTab', ['t1'])).resolves.toEqual({
      ok: true,
      value: null
    })
    expect(calls).toEqual([['setActiveTab', '["t1"]']])
  })
})
