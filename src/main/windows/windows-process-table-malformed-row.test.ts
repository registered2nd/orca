import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __setWindowsProcessTreeLoaderForTests,
  readWindowsProcessTableFresh,
  resetWindowsProcessTableForTests
} from './windows-process-table'

const getAllProcesses = vi.fn()

describe('windows process table, malformed snapshot row', () => {
  let platform: PropertyDescriptor | undefined

  beforeEach(() => {
    getAllProcesses.mockReset()
    platform = Object.getOwnPropertyDescriptor(process, 'platform')
    Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' })
    __setWindowsProcessTreeLoaderForTests(() => ({
      ProcessDataFlag: { None: 0, Memory: 1, CommandLine: 2, CreationTime: 4 },
      supportedProcessDataFlags: 7,
      getAllProcesses
    }))
  })

  afterEach(() => {
    __setWindowsProcessTreeLoaderForTests()
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
    resetWindowsProcessTableForTests()
    await expect(readWindowsProcessTableFresh()).rejects.toThrow()
    expect(thrown).toBeUndefined()
  })
})
