import type { Terminal } from '@xterm/xterm'

// Why: a TUI that captures the mouse (Claude Code's fullscreen mode) draws its own highlight, so
// xterm has no selection; it hands the selected text over as an OSC 52 copy instead.
const MAX_AGE_MS = 5 * 60_000
const MOUSE_REPORT_PREFIXES = ['\x1b[<', '\x1b[M']
const FOCUS_REPORTS = new Set(['\x1b[I', '\x1b[O'])

const copiedByTerminal = new WeakMap<Terminal, { text: string; at: number }>()
const watchedTerminals = new WeakSet<Terminal>()

export function recordTerminalAppCopy(terminal: Terminal, text: string): void {
  if (!text.trim()) {
    return
  }
  copiedByTerminal.set(terminal, { text, at: Date.now() })
  if (!watchedTerminals.has(terminal)) {
    watchedTerminals.add(terminal)
    // Typing moves on from the selection; mouse and focus reports (the right-click, opening the menu) do not.
    terminal.onData((data) => {
      const report =
        FOCUS_REPORTS.has(data) || MOUSE_REPORT_PREFIXES.some((prefix) => data.startsWith(prefix))
      if (!report) {
        copiedByTerminal.delete(terminal)
      }
    })
  }
}

/** The text an app in this terminal last copied as its selection, while still fresh. */
export function readTerminalAppCopy(terminal: Terminal): string | null {
  const copied = copiedByTerminal.get(terminal)
  if (!copied || Date.now() - copied.at > MAX_AGE_MS) {
    return null
  }
  return copied.text
}

export function clearTerminalAppCopy(terminal: Terminal): void {
  copiedByTerminal.delete(terminal)
}
