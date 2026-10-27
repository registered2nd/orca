import { advanceTerminalEscapeBoundary } from '../../../../shared/terminal-partial-escape-tail'
import { recordRendererCrashBreadcrumb } from '@/lib/crash-breadcrumb-recorder'

/** Logs a write that would print an escape's tail (`1002h`, `2026h`, `>4;2m`) as text, with the writes before it (#33766). */

// A chunk opening with a private-marker CSI body, a DEC mode toggle without its `ESC[?`, or a numbered CSI without its ESC.
const ESCAPE_TAIL_START =
  /^(?:\[?[?>=<][0-9]+(?:[;:][0-9]*)*\$?[@-~]|(?:[0-9]+;)*(?:25|47|1000|1002|1003|1004|1005|1006|1015|1016|1047|1048|1049|2004|2026|2027|2031)[hl]|\[[0-9]+(?:;[0-9]*)*[A-Za-z])/

const RECENT_WRITES = 6
const EXCERPT_CHARS = 48
const MAX_REPORTS_PER_TERMINAL = 20

type WriteRecord = { at: number; path: string; length: number; head: string; tail: string }

type TerminalTailState = {
  escape: string
  recent: WriteRecord[]
  reports: number
  producer: { head: string; stack: string } | null
}

type DetectorTerminal = {
  element?: HTMLElement
  buffer?: {
    active?: {
      cursorY?: number
      baseY?: number
      getLine?: (y: number) => { translateToString?: (trimRight?: boolean) => string } | undefined
    }
  }
}

const stateByTerminal = new WeakMap<object, TerminalTailState>()

function stateFor(terminal: object): TerminalTailState {
  let state = stateByTerminal.get(terminal)
  if (!state) {
    state = { escape: '', recent: [], reports: 0, producer: null }
    stateByTerminal.set(terminal, state)
  }
  return state
}

function excerpt(text: string): string {
  return JSON.stringify(text).slice(1, -1)
}

// Why basename:line:col: breadcrumb redaction blanks anything shaped like a path, which would erase the bundle position.
function compactStack(stack: string | undefined): string {
  if (!stack) {
    return ''
  }
  return stack
    .split('\n')
    .slice(2, 16)
    .map((frame) => {
      const fn = /at\s+([^\s(]+)\s+\(/.exec(frame)?.[1] ?? '?'
      const position = /([^/\\]+\.js):(\d+):(\d+)/.exec(frame)
      return position ? `${fn}@${position[1]}:${position[2]}:${position[3]}` : fn
    })
    .join(' < ')
}

function cursorLine(terminal: DetectorTerminal): string {
  try {
    const active = terminal.buffer?.active
    if (!active?.getLine || typeof active.cursorY !== 'number') {
      return ''
    }
    const line = active.getLine((active.baseY ?? 0) + active.cursorY)
    return line?.translateToString?.(true) ?? ''
  } catch {
    return ''
  }
}

/** Producer side: remember who enqueued a tail-shaped chunk, since the drain's own stack can't name it. */
export function noteTerminalOutputProducer(terminal: DetectorTerminal, data: string): void {
  try {
    if (ESCAPE_TAIL_START.test(data)) {
      stateFor(terminal).producer = {
        head: data.slice(0, EXCERPT_CHARS),
        stack: compactStack(new Error('terminal escape tail').stack)
      }
    }
  } catch {}
}

/** Called with the exact bytes handed to xterm, in order; must never throw into the write path. */
export function observeTerminalWrite(
  terminal: DetectorTerminal,
  data: string,
  path: 'fg' | 'bg'
): void {
  try {
    const state = stateFor(terminal)
    const escapeBefore = state.escape
    if (escapeBefore === '' && ESCAPE_TAIL_START.test(data)) {
      reportEscapeTail(terminal, state, data, path)
    }
    state.escape = advanceTerminalEscapeBoundary(escapeBefore, data)
    state.recent.push({
      at: Math.round(performance.now()),
      path,
      length: data.length,
      head: excerpt(data.slice(0, EXCERPT_CHARS)),
      tail: excerpt(data.slice(-EXCERPT_CHARS))
    })
    if (state.recent.length > RECENT_WRITES) {
      state.recent.shift()
    }
  } catch {}
}

function reportEscapeTail(
  terminal: DetectorTerminal,
  state: TerminalTailState,
  data: string,
  path: 'fg' | 'bg'
): void {
  if (state.reports >= MAX_REPORTS_PER_TERMINAL) {
    return
  }
  state.reports += 1
  const now = Math.round(performance.now())
  const paneId = terminal.element?.closest<HTMLElement>('[data-pane-id]')?.dataset.paneId ?? ''
  const details: Record<string, string | number | boolean> = {
    path,
    length: data.length,
    head: excerpt(data.slice(0, 160)),
    pane_id: paneId,
    visible: document.visibilityState === 'visible',
    cursor_line: excerpt(cursorLine(terminal).slice(0, 120)),
    write_stack: compactStack(new Error('terminal escape tail').stack),
    producer_stack:
      state.producer && data.startsWith(state.producer.head) ? state.producer.stack : ''
  }
  // Oldest first; each entry is "ms-before path length head ... tail".
  state.recent.forEach((record, index) => {
    details[`prev_${state.recent.length - index}`] =
      `${now - record.at}ms ${record.path} ${record.length} ${record.head} ... ${record.tail}`
  })
  state.producer = null
  recordRendererCrashBreadcrumb('terminal_escape_tail_written', details)
}
