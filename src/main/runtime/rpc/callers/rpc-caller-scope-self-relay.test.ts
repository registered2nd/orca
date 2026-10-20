import { describe, expect, it } from 'vitest'
import { denyRpcMethodForCaller, type RpcCallerScope } from './rpc-caller-scope'

const PAIRED: RpcCallerScope = { kind: 'runtime-paired', grants: [] }

describe('runtime-paired callers and their own relay credential', () => {
  it('may install and confirm the relay credential of the device they authenticated as', () => {
    expect(denyRpcMethodForCaller(PAIRED, 'pairing.provisionRelay', 'pairing-admin')).toBeNull()
    expect(denyRpcMethodForCaller(PAIRED, 'pairing.getEndpoints', 'pairing-admin')).toBeNull()
  })

  it('still cannot reach any other pairing administration', () => {
    expect(denyRpcMethodForCaller(PAIRED, 'appFunctions.invokeIpc', 'pairing-admin')).not.toBeNull()
    expect(
      denyRpcMethodForCaller(
        { kind: 'mobile', delegated: true },
        'pairing.provisionRelay',
        'pairing-admin'
      )
    ).not.toBeNull()
  })
})
