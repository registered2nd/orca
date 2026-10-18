export type CliPreferences = {
  terminalRightClickToPaste: boolean
}

export type CliShortcut = {
  actionId: string
  title: string
  group: string
  bindings: string[]
  customized: boolean
}
