import { TerminalPaneSurface } from './TerminalPaneSurface'
import { TerminalRestoringPlaceholder } from './TerminalRestoringPlaceholder'
import { TerminalSelectionAskPortal } from './TerminalSelectionAskPortal'
import { TerminalSelectionAskContext } from './terminal-selection-ask-context'
import { useTerminalPaneController } from './use-terminal-pane-controller'
import { useHostTerminalScrollbackHold } from './snapshots/use-host-terminal-scrollback-hold'
import type { TerminalPaneProps } from './terminal-pane-types'

function MountedTerminalPane(props: TerminalPaneProps): React.JSX.Element {
  const controller = useTerminalPaneController(props)
  return (
    <TerminalSelectionAskContext.Provider value={controller.selectionAsk}>
      <TerminalPaneSurface controller={controller} />
      <TerminalSelectionAskPortal controller={controller} />
    </TerminalSelectionAskContext.Provider>
  )
}

export default function TerminalPane(props: TerminalPaneProps): React.JSX.Element {
  const holdForHostScrollback = useHostTerminalScrollbackHold(props.tabId, props.worktreeId)
  return holdForHostScrollback ? (
    <TerminalRestoringPlaceholder />
  ) : (
    <MountedTerminalPane {...props} />
  )
}
