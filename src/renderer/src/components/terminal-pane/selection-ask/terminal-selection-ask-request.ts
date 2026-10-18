type TerminalSelectionAskRequest = { tabId: string; paneId: number }

// Why: the keyboard runtime is built before the pane's menu state, so the shortcut reaches it through this channel.
const listeners = new Set<(request: TerminalSelectionAskRequest) => void>()

export function requestTerminalSelectionAsk(request: TerminalSelectionAskRequest): void {
  for (const listener of listeners) {
    listener(request)
  }
}

export function subscribeTerminalSelectionAsk(
  listener: (request: TerminalSelectionAskRequest) => void
): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
