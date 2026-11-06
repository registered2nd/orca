import { TerminalPaneSurface } from './controller/TerminalPaneSurface'
import { useTerminalPaneController } from './controller/use-terminal-pane-controller'
import { TerminalSelectionAskPortal } from './selection-ask/TerminalSelectionAskPortal'
import { TerminalSelectionAskContext } from './selection-ask/terminal-selection-ask-context'
import type { TerminalPaneProps } from './controller/terminal-pane-types'

export default function TerminalPane(props: TerminalPaneProps): React.JSX.Element {
  const controller = useTerminalPaneController(props)
  return (
    <TerminalSelectionAskContext.Provider value={controller.selectionAsk}>
      <TerminalPaneSurface controller={controller} />
      <TerminalSelectionAskPortal controller={controller} />
    </TerminalSelectionAskContext.Provider>
  )
}
