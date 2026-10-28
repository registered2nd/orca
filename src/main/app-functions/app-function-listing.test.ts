import { z } from 'zod'
import { describe, expect, it, vi } from 'vitest'
import { InvalidArgumentError } from '../runtime/rpc/core'
import { AppIpcUnreachableError, type AppIpcHost } from './app-ipc-host'
import { invokeAppIpcFunction, listAppFunctions } from './app-function-listing'

function fakeHost(
  handlers: Record<string, string>,
  invoke: AppIpcHost['invoke'] = vi.fn()
): AppIpcHost {
  return {
    listChannels: () =>
      Object.entries(handlers).map(([channel, handlerSource]) => ({ channel, handlerSource })),
    invoke,
    callRenderer: vi.fn()
  }
}

describe('listAppFunctions', () => {
  it('types live IPC channels from the source catalog and names the rest from the live handler', () => {
    const host = fakeHost({
      'mobile:revokeRuntimeAccess': '(_event, args) => revoke(args)',
      'test:uncataloged': 'async (event, first, second = 2) => ({ first, second })'
    })
    const { functions, ipcAvailable } = listAppFunctions({ host, rpcMethods: [] })

    expect(ipcAvailable).toBe(true)
    expect(functions).toEqual([
      {
        kind: 'ipc',
        name: 'mobile:revokeRuntimeAccess',
        params: [{ name: 'args', type: '{ deviceId: string; }', optional: false, rest: false }],
        source: expect.stringMatching(/^src\/main\/ipc\/mobile\.ts:\d+$/),
        preload: expect.objectContaining({ api: 'window.api.mobile.revokeRuntimeAccess' })
      },
      {
        kind: 'ipc',
        name: 'test:uncataloged',
        params: [
          { name: 'first', type: null, optional: false, rest: false },
          { name: 'second', type: null, optional: true, rest: false }
        ],
        source: null,
        preload: null
      }
    ])
  })

  it('lists RPC methods with a JSON Schema of their params, filtered by name', () => {
    const rpcMethods = [
      { name: 'demo.one', permission: 'workspace', params: z.object({ id: z.string() }) },
      { name: 'demo.two', permission: 'workspace', params: null }
    ]
    const { functions, ipcAvailable } = listAppFunctions({
      host: null,
      rpcMethods,
      name: 'demo.one'
    })

    expect(ipcAvailable).toBe(false)
    expect(functions).toEqual([
      {
        kind: 'rpc',
        name: 'demo.one',
        permission: 'workspace',
        streaming: false,
        paramsSchema: expect.objectContaining({ properties: { id: { type: 'string' } } }),
        exposedByCli: false
      }
    ])
  })
})

describe('invokeAppIpcFunction', () => {
  it('returns the handler result in a JSON-safe form', async () => {
    const invoke = vi.fn().mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      seen: new Map([['a', 1]]),
      missing: undefined
    })
    const host = fakeHost({ 'test:bytes': '(_event, id) => read(id)' }, invoke)

    await expect(invokeAppIpcFunction(host, 'test:bytes', ['x'])).resolves.toEqual({
      ok: true,
      value: { bytes: { $bytes: 'AQID' }, seen: { $map: [['a', 1]] } }
    })
    expect(invoke).toHaveBeenCalledWith('test:bytes', ['x'])
  })

  it('reports a handler throw as the function failing, not as an invoke error', async () => {
    const failure = Object.assign(new Error('grant not found'), { code: 'not_found' })
    const host = fakeHost(
      { 'test:fails': '(_event, id) => fail(id)' },
      vi.fn().mockRejectedValue(failure)
    )

    await expect(invokeAppIpcFunction(host, 'test:fails', ['x'])).resolves.toEqual({
      ok: false,
      error: { name: 'Error', message: 'grant not found', code: 'not_found' }
    })
  })

  it('refuses an unknown channel before calling anything', async () => {
    const invoke = vi.fn()
    const host = fakeHost({ 'test:known': '() => 1' }, invoke)

    await expect(invokeAppIpcFunction(host, 'test:unknown', [])).rejects.toBeInstanceOf(
      InvalidArgumentError
    )
    expect(invoke).not.toHaveBeenCalled()
  })

  it('validates the argument count against the declared parameters', async () => {
    const invoke = vi.fn()
    const host = fakeHost(
      {
        'mobile:revokeRuntimeAccess': '(_event, args) => revoke(args)',
        'test:rest': '(_event, ...items) => items'
      },
      invoke
    )

    await expect(invokeAppIpcFunction(host, 'mobile:revokeRuntimeAccess', [])).rejects.toThrow(
      "'mobile:revokeRuntimeAccess' needs at least 1 argument(s) (args); got 0."
    )
    await expect(
      invokeAppIpcFunction(host, 'mobile:revokeRuntimeAccess', [{ deviceId: 'd' }, 'extra'])
    ).rejects.toThrow("'mobile:revokeRuntimeAccess' takes at most 1 argument(s) (args); got 2.")
    expect(invoke).not.toHaveBeenCalled()

    await invokeAppIpcFunction(host, 'test:rest', [1, 2, 3])
    expect(invoke).toHaveBeenCalledWith('test:rest', [1, 2, 3])
  })

  it('surfaces a missing window as an invoke error', async () => {
    const host = fakeHost(
      { 'test:window': '(event) => event.sender.id' },
      vi
        .fn()
        .mockRejectedValue(
          new AppIpcUnreachableError('app_ipc_no_window', 'The Orca window is not open')
        )
    )

    await expect(invokeAppIpcFunction(host, 'test:window', [])).rejects.toThrow(
      'The Orca window is not open'
    )
  })

  it('fails clearly in a runtime without a desktop window process', async () => {
    await expect(invokeAppIpcFunction(null, 'test:any', [])).rejects.toThrow(
      'no desktop window process'
    )
  })
})
