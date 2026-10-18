import type { Terminal } from '@xterm/xterm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearTerminalAppCopy,
  readTerminalAppCopy,
  recordTerminalAppCopy
} from './terminal-app-copied-selection'

function fakeTerminal(): { terminal: Terminal; type: (data: string) => void } {
  const listeners: ((data: string) => void)[] = []
  const fake = {
    onData: (listener: (data: string) => void) => {
      listeners.push(listener)
      return { dispose: () => undefined }
    }
  }
  return {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the module only calls onData.
    terminal: fake as unknown as Terminal,
    type: (data) => listeners.forEach((listener) => listener(data))
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('terminal app copied selection', () => {
  it('keeps the copy through the right-click and the menu taking focus', () => {
    const { terminal, type } = fakeTerminal()
    recordTerminalAppCopy(terminal, 'selected text')
    type('\x1b[<2;10;5M')
    type('\x1b[O')
    expect(readTerminalAppCopy(terminal)).toBe('selected text')
  })

  it('drops the copy once the user types into the pane', () => {
    const { terminal, type } = fakeTerminal()
    recordTerminalAppCopy(terminal, 'selected text')
    type('a')
    expect(readTerminalAppCopy(terminal)).toBeNull()
  })

  it('expires a stale copy and can be spent', () => {
    vi.useFakeTimers()
    const { terminal } = fakeTerminal()
    recordTerminalAppCopy(terminal, 'old')
    vi.advanceTimersByTime(6 * 60_000)
    expect(readTerminalAppCopy(terminal)).toBeNull()
    recordTerminalAppCopy(terminal, 'new')
    clearTerminalAppCopy(terminal)
    expect(readTerminalAppCopy(terminal)).toBeNull()
  })
})
