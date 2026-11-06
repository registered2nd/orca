import { createContext } from 'react'
import type { TerminalSelectionAskState } from './use-terminal-selection-ask'

/** The pane's Ask state for its menu, provided beside the pane surface, which is at its line limit. */
export const TerminalSelectionAskContext = createContext<TerminalSelectionAskState | null>(null)
