import { useCallback, useEffect, useState } from 'react'
import type { ManagedPane, PaneManager } from '@/lib/pane-manager/pane-manager'
import type { TerminalSelectionAsk } from './TerminalSelectionAskPanel'
import { subscribeTerminalSelectionAsk } from './terminal-selection-ask-request'

export type TerminalSelectionAskState = {
  canAskAboutSelection: boolean
  onAskAboutSelection: () => void
  askSelection: TerminalSelectionAsk | null
  closeAskSelection: () => void
}

/** Ask about the selection, from the pane menu or the shortcut: holds what was selected while the question is typed. */
export function useTerminalSelectionAsk({
  managerRef,
  tabId,
  menuOpen,
  setMenuOpen,
  resolveMenuPane
}: {
  managerRef: React.RefObject<PaneManager | null>
  tabId: string
  menuOpen: boolean
  setMenuOpen: (open: boolean) => void
  resolveMenuPane: () => ManagedPane | null
}): TerminalSelectionAskState {
  const [askSelection, setAskSelection] = useState<TerminalSelectionAsk | null>(null)

  const openAskSelection = useCallback(
    (pane: ManagedPane | null): void => {
      const text = pane?.terminal.getSelection() ?? ''
      if (!pane || !text.trim()) {
        return
      }
      setMenuOpen(false)
      setAskSelection({ paneId: pane.id, leafId: pane.leafId, text, columns: pane.terminal.cols })
    },
    [setMenuOpen]
  )

  useEffect(
    () =>
      subscribeTerminalSelectionAsk((request) => {
        if (request.tabId === tabId) {
          const panes = managerRef.current?.getPanes() ?? []
          openAskSelection(panes.find((pane) => pane.id === request.paneId) ?? null)
        }
      }),
    [managerRef, openAskSelection, tabId]
  )

  const askPaneId = askSelection?.paneId ?? null
  const closeAskSelection = useCallback((): void => {
    setAskSelection(null)
    const panes = managerRef.current?.getPanes() ?? []
    panes.find((pane) => pane.id === askPaneId)?.terminal.focus()
  }, [askPaneId, managerRef])

  return {
    // Why: PaneManager.getPanes() allocates; a closed menu needs no selection check.
    canAskAboutSelection: menuOpen ? Boolean(resolveMenuPane()?.terminal.hasSelection()) : false,
    onAskAboutSelection: () => openAskSelection(resolveMenuPane()),
    askSelection,
    closeAskSelection
  }
}
