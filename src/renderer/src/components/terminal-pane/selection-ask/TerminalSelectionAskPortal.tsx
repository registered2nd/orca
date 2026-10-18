import { createPortal } from 'react-dom'
import type { ManagedPane } from '@/lib/pane-manager/pane-manager'
import { TerminalSelectionAskPanel, type TerminalSelectionAsk } from './TerminalSelectionAskPanel'

export function TerminalSelectionAskPortal({
  tabId,
  worktreeId,
  ask,
  panes,
  onClose
}: {
  tabId: string
  worktreeId: string
  ask: TerminalSelectionAsk | null
  panes: readonly ManagedPane[]
  onClose: () => void
}): React.JSX.Element | null {
  const pane = ask ? panes.find((candidate) => candidate.id === ask.paneId) : undefined
  if (!ask || !pane) {
    return null
  }
  return createPortal(
    <TerminalSelectionAskPanel
      key={`${ask.paneId}:${ask.text}`}
      tabId={tabId}
      worktreeId={worktreeId}
      ask={ask}
      onClose={onClose}
    />,
    pane.container
  )
}
