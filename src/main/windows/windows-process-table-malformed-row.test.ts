import type * as NodeModule from 'node:module'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readWindowsProcessTableFresh } from './windows-process-table'

const { getAllProcesses } = vi.hoisted(() => ({ getAllProcesses: vi.fn() }))

// The table loads its addon through createRequire, which a vi.mock of the package does not reach.
vi.mock('node:module', async (importOriginal) => ({
  ...(await importOriginal<typeof NodeModule>()),
  createRequire: () => (specifier: string) => {
    if (specifier !== '@vscode/windows-process-tree') {
      throw new Error(`unexpected require: ${specifier}`)
    }
    return {
      ProcessDataFlag: { None: 0, Memory: 1, CommandLine: 2, CreationTime: 4 },
      supportedProcessDataFlags: 7,
      getAllProcesses
    }
  }
}))

describe('windows process table, malformed snapshot row', () => {
  let platform: PropertyDescriptor | undefined

  beforeEach(() => {
    platform = Object.getOwnPropertyDescriptor(process, 'platform')
    Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' })
  })

  afterEach(() => {
    if (platform) {
      Object.defineProperty(process, 'platform', platform)
    }
  })

  it('rejects, without throwing inside the addon callback, a snapshot with a malformed row', async () => {
    // 2026-10-28: a failed scan's rows reached `.some`, which threw inside the addon's callback loop and
    // ended the terminal host with every PTY on it.
    let thrown: unknown
    getAllProcesses.mockImplementation((cb: (rows: unknown) => void) => {
      try {
        cb([null])
      } catch (error) {
        thrown = error
      }
    })
    await expect(readWindowsProcessTableFresh()).rejects.toThrow()
    expect(thrown).toBeUndefined()
  })
})
