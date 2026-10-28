import { useAppStore } from '@/store'
import { requestBackgroundTerminalWorktreeMount } from '@/components/terminal/background-terminal-worktree-mount'
import { wakeSleepingAgentsForWorktreeInBackground } from './wake-sleeping-agents-in-background'
import type {
  RendererActionsListResult,
  RendererTerminalTab,
  RendererTerminalsLoadResult
} from '../../../shared/renderer-app-actions-contract'

// Why the window's store: every renderer-only UI action (tabs, panes, sidebar, dialogs, menus) is a
// store action, so exposing the store reaches each new UI feature with no per-feature wiring.
// Main reaches this through `webContents.executeJavaScript`; answers are JSON text so any value crosses.

const MAX_DEPTH = 8

function toJsonSafe(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value === undefined || value === null) {
    return null
  }
  if (typeof value === 'function') {
    return '[function]'
  }
  if (typeof value === 'bigint') {
    return value.toString()
  }
  if (typeof value !== 'object') {
    return value
  }
  if (seen.has(value)) {
    return '[circular]'
  }
  if (depth >= MAX_DEPTH) {
    return '[truncated]'
  }
  seen.add(value)
  try {
    if (value instanceof Map) {
      return Object.fromEntries(
        [...value].map(([k, v]) => [String(k), toJsonSafe(v, depth + 1, seen)])
      )
    }
    if (value instanceof Set || Array.isArray(value)) {
      return [...value].map((item) => toJsonSafe(item, depth + 1, seen))
    }
    if (value instanceof Error) {
      return { name: value.name, message: value.message }
    }
    if (typeof Node !== 'undefined' && value instanceof Node) {
      return '[dom node]'
    }
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      out[key] = toJsonSafe(item, depth + 1, seen)
    }
    return out
  } finally {
    seen.delete(value)
  }
}

function json(value: unknown): string {
  return JSON.stringify(toJsonSafe(value, 0, new WeakSet())) ?? 'null'
}

function storeState(): Record<string, unknown> {
  // SAFETY: the store state is a plain object; this reads its keys by name.
  return useAppStore.getState() as unknown as Record<string, unknown>
}

export function listRendererActions(): RendererActionsListResult {
  const state = storeState()
  const actions: RendererActionsListResult['actions'] = []
  const stateKeys: string[] = []
  for (const [key, value] of Object.entries(state)) {
    if (typeof value === 'function') {
      actions.push({ name: key, arity: value.length })
    } else {
      stateKeys.push(key)
    }
  }
  actions.sort((a, b) => a.name.localeCompare(b.name))
  stateKeys.sort()
  return { actions, stateKeys }
}

export async function invokeRendererAction(name: string, args: unknown[]): Promise<unknown> {
  const action = storeState()[name]
  if (typeof action !== 'function') {
    throw new Error(`No renderer action named '${name}'.`)
  }
  return await action(...args)
}

export function readRendererState(path: string | undefined): unknown {
  let current: unknown = storeState()
  for (const segment of (path ?? '').split('.').filter(Boolean)) {
    if (current === null || typeof current !== 'object') {
      return null
    }
    current =
      current instanceof Map ? current.get(segment) : (Reflect.get(current, segment) ?? null)
  }
  return current
}

export function listRendererTerminalTabs(): RendererTerminalTab[] {
  const state = useAppStore.getState()
  const tabs: RendererTerminalTab[] = []
  for (const [worktreeId, worktreeTabs] of Object.entries(state.tabsByWorktree)) {
    for (const tab of worktreeTabs) {
      const ptyIds = state.ptyIdsByTabId[tab.id] ?? []
      tabs.push({
        tabId: tab.id,
        worktreeId,
        title: tab.customTitle ?? tab.generatedTitle ?? tab.title,
        ptyIds,
        loaded: ptyIds.length > 0 || tab.ptyId !== null,
        active: state.activeTabIdByWorktree[worktreeId] === tab.id,
        focused: state.activeWorktreeId === worktreeId && state.activeTabId === tab.id
      })
    }
  }
  return tabs
}

// Mounts every saved terminal tab off-screen, as a click on each would, and wakes slept agents.
export function loadAllRendererTerminals(): RendererTerminalsLoadResult {
  const tabs = listRendererTerminalTabs()
  const worktreeIds = [...new Set(tabs.filter((tab) => !tab.loaded).map((tab) => tab.worktreeId))]
  for (const worktreeId of worktreeIds) {
    requestBackgroundTerminalWorktreeMount({ worktreeId })
    wakeSleepingAgentsForWorktreeInBackground(worktreeId)
  }
  return {
    workspaceSessionReady: useAppStore.getState().workspaceSessionReady,
    requestedWorktreeIds: worktreeIds,
    unloadedTabIds: tabs.filter((tab) => !tab.loaded).map((tab) => tab.tabId),
    totalTabs: tabs.length
  }
}

export type RendererAppActionsBridge = {
  list(): string
  invoke(name: string, argsJson: string): Promise<string>
  state(path: string): string
  terminalTabs(): string
  loadTerminals(): string
}

declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- declaration merging requires interface
  interface Window {
    __orcaRendererActions?: RendererAppActionsBridge
  }
}

export function installRendererAppActions(): void {
  window.__orcaRendererActions = {
    list: () => json(listRendererActions()),
    invoke: async (name, argsJson) => {
      const parsed: unknown = JSON.parse(argsJson)
      return json(await invokeRendererAction(name, Array.isArray(parsed) ? parsed : []))
    },
    state: (path) => json(readRendererState(path)),
    terminalTabs: () => json(listRendererTerminalTabs()),
    loadTerminals: () => json(loadAllRendererTerminals())
  }
}
