import { describe, expect, it } from 'vitest'
import { denyRpcMethodForCaller } from '../rpc-caller-scope'
import { APP_FUNCTION_METHODS } from './app-functions'

describe('app function RPC methods', () => {
  it('are reachable by this host only, never by a paired client or a phone', () => {
    for (const method of APP_FUNCTION_METHODS) {
      expect(denyRpcMethodForCaller({ kind: 'owner' }, method.name, method.permission)).toBeNull()
      expect(
        denyRpcMethodForCaller(
          { kind: 'runtime-paired', grants: ['desktop-control'] },
          method.name,
          method.permission
        )
      ).not.toBeNull()
      expect(
        denyRpcMethodForCaller({ kind: 'mobile' }, method.name, method.permission)
      ).not.toBeNull()
    }
  })

  it('list themselves among the RPC functions', async () => {
    const list = APP_FUNCTION_METHODS[0]
    const result = await list.handler({ name: 'appFunctions.invokeIpc' }, {} as never)

    expect(result.functions).toEqual([
      expect.objectContaining({ kind: 'rpc', name: 'appFunctions.invokeIpc', exposedByCli: false })
    ])
    // Why the long timeout: the call-time import loads the whole RPC method graph, slow under vitest.
  }, 120_000)
})
