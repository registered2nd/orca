import { createPortal } from 'react-dom'
import type { ManagedPane } from '@/lib/pane-manager/pane-manager'
import { TerminalSelectionAskPanel } from './TerminalSelectionAskPanel'
import type { TerminalSelectionAskState } from './use-terminal-selection-ask'

/** Mounted beside the pane surface, which is at its line limit; reads the pane controller whole. */
export function TerminalSelectionAskPortal({
  controller
}: {
  controller: {
    tabId: string
    worktreeId: string
    managedPanes: readonly ManagedPane[]
    selectionAsk: TerminalSelectionAskState
  }
}): React.JSX.Element | null {
  const { tabId, worktreeId, managedPanes, selectionAsk } = controller
  const ask = selectionAsk.askSelection
  const pane = ask ? managedPanes.find((candidate) => candidate.id === ask.paneId) : undefined
  if (!ask || !pane) {
    return null
  }
  return createPortal(
    <TerminalSelectionAskPanel
      key={`${ask.paneId}:${ask.text}`}
      tabId={tabId}
      worktreeId={worktreeId}
      ask={ask}
      onClose={selectionAsk.closeAskSelection}
    />,
    pane.container
  )
}
