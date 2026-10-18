import {
  getEffectiveKeybindingsForDefinition,
  isKeybindingActionId,
  KEYBINDING_DEFINITIONS,
  type KeybindingActionId
} from '../../shared/keybindings'
import type { CliPreferences, CliShortcut } from '../../shared/cli-preferences-types'
import type { KeybindingService } from '../keybindings/keybinding-service'
import { broadcastKeybindingsChanged } from '../ipc/keybindings'
import type { Store } from '../persistence'

// Why: the RPC surface (CLI) writes the same owners the Settings page does, without threading them through the runtime class.
let preferencesStore: Store | null = null
let keybindingService: KeybindingService | null = null

export function setCliPreferencesOwners(store: Store, keybindings: KeybindingService | null): void {
  preferencesStore = store
  keybindingService = keybindings
}

function requireStore(): Store {
  if (!preferencesStore) {
    throw new Error('preferences_unavailable')
  }
  return preferencesStore
}

function requireKeybindings(): KeybindingService {
  if (!keybindingService) {
    throw new Error('keybindings_unavailable')
  }
  return keybindingService
}

export function getCliPreferences(): CliPreferences {
  return { terminalRightClickToPaste: requireStore().getSettings().terminalRightClickToPaste }
}

export function updateCliPreferences(update: Partial<CliPreferences>): CliPreferences {
  requireStore().updateSettings(update, { notifyListeners: true })
  return getCliPreferences()
}

export function listCliShortcuts(): CliShortcut[] {
  const overrides = requireKeybindings().getOverrides()
  return KEYBINDING_DEFINITIONS.map((definition) => ({
    actionId: definition.id,
    title: definition.title,
    group: definition.group,
    bindings: getEffectiveKeybindingsForDefinition(definition, process.platform, overrides),
    customized: Array.isArray(overrides[definition.id])
  }))
}

export function setCliShortcut(actionId: string, bindings: string[] | null): CliShortcut {
  if (!isKeybindingActionId(actionId)) {
    throw new Error(
      `Unknown shortcut action "${actionId}". Run \`orca shortcut list\` for the ids.`
    )
  }
  const id: KeybindingActionId = actionId
  const snapshot = requireKeybindings().setActionBindings(id, bindings)
  broadcastKeybindingsChanged(snapshot)
  const shortcut = listCliShortcuts().find((candidate) => candidate.actionId === id)
  if (!shortcut) {
    throw new Error(`Unknown shortcut action "${actionId}".`)
  }
  return shortcut
}
