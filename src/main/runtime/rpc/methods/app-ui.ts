import {
  AppUiInvokeParams,
  AppUiLoadTerminalsParams,
  AppUiStateParams
} from '../../../../shared/rpc-contract/app-functions-params'
import { getAppIpcHost } from '../../../app-functions/app-ipc-host'
import {
  invokeRendererAction,
  listRendererActions,
  listRendererTerminalTabs,
  loadAllRendererTerminals,
  readRendererState
} from '../../../app-functions/renderer-app-actions'
import { defineMethod } from '../core'

// Why pairing-admin: as with appFunctions, a window action can do anything the desktop UI can.
export const APP_UI_METHODS = [
  defineMethod({
    name: 'appUi.listActions',
    permission: 'pairing-admin',
    params: null,
    handler: () => listRendererActions(getAppIpcHost())
  }),
  defineMethod({
    name: 'appUi.invoke',
    permission: 'pairing-admin',
    params: AppUiInvokeParams,
    handler: (params) => invokeRendererAction(getAppIpcHost(), params.name, params.args)
  }),
  defineMethod({
    name: 'appUi.state',
    permission: 'pairing-admin',
    params: AppUiStateParams,
    handler: async (params) => ({ value: await readRendererState(getAppIpcHost(), params.path) })
  }),
  defineMethod({
    name: 'appUi.terminalTabs',
    permission: 'pairing-admin',
    params: null,
    handler: async () => ({ tabs: await listRendererTerminalTabs(getAppIpcHost()) })
  }),
  defineMethod({
    name: 'appUi.loadTerminals',
    permission: 'pairing-admin',
    params: AppUiLoadTerminalsParams,
    handler: (params) => loadAllRendererTerminals(getAppIpcHost(), params.waitMs)
  })
] as const
