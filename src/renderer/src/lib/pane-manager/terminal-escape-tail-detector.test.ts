import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { noteTerminalOutputProducer, observeTerminalWrite } from './terminal-escape-tail-detector'

describe('terminal escape tail detector', () => {
  const recordBreadcrumb = vi.fn()

  beforeEach(() => {
    recordBreadcrumb.mockReset()
    vi.stubGlobal('window', { api: { crashReports: { recordBreadcrumb } } })
    vi.stubGlobal('document', { visibilityState: 'visible' })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('stays quiet when an escape split across writes is completed', () => {
    const terminal = {}
    observeTerminalWrite(terminal, 'prompt\x1b[?', 'fg')
    observeTerminalWrite(terminal, '1002h\x1b[>4;2m', 'fg')
    expect(recordBreadcrumb).not.toHaveBeenCalled()
  })

  it.each(['1002h rest', '2026h', '>4;2m', '[?1002h', '[38;5;1mtext'])(
    'reports %j written while the parser is at ground',
    (tail) => {
      const terminal = {}
      observeTerminalWrite(terminal, 'before\x1b[?2026l', 'bg')
      noteTerminalOutputProducer(terminal, tail)
      observeTerminalWrite(terminal, tail, 'fg')
      expect(recordBreadcrumb).toHaveBeenCalledTimes(1)
      const { name, data } = recordBreadcrumb.mock.calls[0][0]
      expect(name).toBe('terminal_escape_tail_written')
      expect(data.path).toBe('fg')
      expect(data.prev_1).toContain('bg 14 before')
      expect(data.producer_stack).not.toBe('')
    }
  )

  it('ignores ordinary text at ground', () => {
    const terminal = {}
    for (const text of ['hello', '? Yes', '25 items', '[x] done', '1002 files']) {
      observeTerminalWrite(terminal, text, 'fg')
    }
    expect(recordBreadcrumb).not.toHaveBeenCalled()
  })
})
