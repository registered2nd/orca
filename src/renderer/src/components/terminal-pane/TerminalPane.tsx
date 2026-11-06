import { TerminalPaneSurface } from './controller/TerminalPaneSurface'
import { TerminalRestoringPlaceholder } from './mounting/TerminalRestoringPlaceholder'
import { useTerminalPaneController } from './controller/use-terminal-pane-controller'
import { TerminalSelectionAskPortal } from './selection-ask/TerminalSelectionAskPortal'
import { TerminalSelectionAskContext } from './selection-ask/terminal-selection-ask-context'
import { useHostTerminalScrollbackHold } from './snapshots/use-host-terminal-scrollback-hold'
import type { TerminalPaneProps } from './controller/terminal-pane-types'

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
