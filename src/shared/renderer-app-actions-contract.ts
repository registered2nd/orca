// What `orca app ui …` reads and runs: the desktop window's own store actions and state.

export type RendererActionsListResult = {
  actions: { name: string; arity: number }[]
  stateKeys: string[]
}

export type RendererTerminalTab = {
  tabId: string
  worktreeId: string
  title: string
  ptyIds: string[]
  // True once every pane of the tab is mounted in the window and attached to its PTY.
  loaded: boolean
  active: boolean
  focused: boolean
}

export type RendererTerminalsLoadResult = {
  workspaceSessionReady: boolean
  requestedWorktreeIds: string[]
  unloadedTabIds: string[]
  totalTabs: number
}

export type RendererBridgeOperation = 'list' | 'invoke' | 'state' | 'terminalTabs' | 'loadTerminals'

export type RendererTerminalsLoadOutcome = RendererTerminalsLoadResult & {
  stillUnloadedTabIds: string[]
}
