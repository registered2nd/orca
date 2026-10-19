import type {
  AppFunctionsListResult,
  AppIpcInvokeResult
} from '../../../../shared/app-functions-contract'
import {
  AppFunctionsInvokeIpcParams,
  AppFunctionsListParams
} from '../../../../shared/rpc-contract/app-functions-params'
import { getAppIpcHost } from '../../../app-functions/app-ipc-host'
import { invokeAppIpcFunction, listAppFunctions } from '../../../app-functions/app-function-listing'
import { defineMethod, type RpcTypedMethod } from '../core'

// Why annotated and a call-time import: the list handler reads ALL_RPC_METHODS, which contains these
// methods, so an inferred type would be circular and a static import would read it half-built.
type AppFunctionMethods = readonly [
  RpcTypedMethod<
    'appFunctions.list',
    typeof AppFunctionsListParams,
    Promise<AppFunctionsListResult>
  >,
  RpcTypedMethod<
    'appFunctions.invokeIpc',
    typeof AppFunctionsInvokeIpcParams,
    Promise<AppIpcInvokeResult>
  >
]

// Why pairing-admin: a UI function can do anything the desktop can, and this is the one permission
// no paired client is ever granted, so only this host's own CLI and desktop reach these.
export const APP_FUNCTION_METHODS: AppFunctionMethods = [
  defineMethod({
    name: 'appFunctions.list',
    permission: 'pairing-admin',
    params: AppFunctionsListParams,
    handler: async (params) =>
      listAppFunctions({
        host: getAppIpcHost(),
        rpcMethods: (await import('./index')).ALL_RPC_METHODS,
        name: params?.name
      })
  }),
  defineMethod({
    name: 'appFunctions.invokeIpc',
    permission: 'pairing-admin',
    params: AppFunctionsInvokeIpcParams,
    handler: (params) => invokeAppIpcFunction(getAppIpcHost(), params.channel, params.args)
  })
]
