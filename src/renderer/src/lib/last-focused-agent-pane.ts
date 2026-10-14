import { getFocusedAgentPaneKeyForWorktree } from '@/components/sidebar/focused-agent-row-highlight'
import { useAppStore } from '@/store'

export type FocusedAgentPane = { paneKey: string; worktreeId: string }

// Why: "the agent the user is working with" must survive focus moving to a browser pane or a plain shell.
let lastFocused: FocusedAgentPane | null = null
let trackers = 0
let unsubscribe: (() => void) | null = null
const listeners = new Set<() => void>()

function record(): void {
  const state = useAppStore.getState()
  const worktreeId = state.activeWorktreeId
  if (!worktreeId) {
    return
  }
  const paneKey = getFocusedAgentPaneKeyForWorktree(state, worktreeId)
  if (paneKey && (paneKey !== lastFocused?.paneKey || worktreeId !== lastFocused.worktreeId)) {
    lastFocused = { paneKey, worktreeId }
    for (const listener of listeners) {
      listener()
    }
  }
}

/** Starts following focus; returns the stop function. Reference-counted across callers. */
export function trackLastFocusedAgentPane(): () => void {
  trackers += 1
  if (!unsubscribe) {
    record()
    unsubscribe = useAppStore.subscribe(record)
  }
  return () => {
    trackers -= 1
    if (trackers === 0) {
      unsubscribe?.()
      unsubscribe = null
    }
  }
}

export function getLastFocusedAgentPane(): FocusedAgentPane | null {
  return lastFocused
}

export function subscribeLastFocusedAgentPane(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
