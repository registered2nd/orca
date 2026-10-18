import { defineMethod } from '../core'
import {
  KeybindingSet,
  PreferencesUpdate
} from '../../../../shared/rpc-contract/preferences-params'
import {
  getCliPreferences,
  listCliShortcuts,
  setCliShortcut,
  updateCliPreferences
} from '../../../preferences/cli-preferences-service'

export const PREFERENCES_METHODS = [
  defineMethod({
    name: 'preferences.get',
    permission: 'workspace',
    params: null,
    handler: () => getCliPreferences()
  }),
  defineMethod({
    name: 'preferences.update',
    permission: 'settings-write',
    params: PreferencesUpdate,
    handler: (params) => updateCliPreferences(params)
  }),
  defineMethod({
    name: 'preferences.shortcuts.list',
    permission: 'workspace',
    params: null,
    handler: () => ({ shortcuts: listCliShortcuts() })
  }),
  defineMethod({
    name: 'preferences.shortcuts.set',
    permission: 'settings-write',
    params: KeybindingSet,
    handler: (params) => setCliShortcut(params.actionId, params.bindings)
  })
]
