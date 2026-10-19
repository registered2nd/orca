import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppFunction } from '../../shared/app-functions-contract'
import { APP_FUNCTION_HANDLERS } from './app-functions'

const IPC_REVOKE: AppFunction = {
  kind: 'ipc',
  name: 'mobile:revokeRuntimeAccess',
  params: [{ name: 'args', type: '{ deviceId: string; }', optional: false, rest: false }],
  source: 'src/main/ipc/mobile.ts:250',
  preload: {
    api: 'window.api.mobile.revokeRuntimeAccess',
    source: 'src/preload/api/mobile-bridge.ts:72',
    params: [],
    returns: null
  }
}
const RPC_COVERED: AppFunction = {
  kind: 'rpc',
  name: 'worktree.list',
  permission: 'workspace',
  streaming: false,
  paramsSchema: null,
  exposedByCli: true
}
const RPC_UNCOVERED: AppFunction = {
  kind: 'rpc',
  name: 'pairing.getEndpoints',
  permission: 'pairing-admin',
  streaming: false,
  paramsSchema: { type: 'object', properties: { scope: { type: 'string' } } },
  exposedByCli: false
}
const RPC_STREAM: AppFunction = { ...RPC_UNCOVERED, name: 'files.watch', streaming: true }
const ALL = [IPC_REVOKE, RPC_COVERED, RPC_UNCOVERED, RPC_STREAM]

const envelope = (result: unknown) => ({ id: 'r1', ok: true, result, _meta: { runtimeId: 'rt' } })

// Answers appFunctions.list like the runtime: everything, or the entries with one name.
function fakeClient(answers: Record<string, unknown> = {}) {
  return vi.fn(async (method: string, params?: { name?: string }) => {
    if (method === 'appFunctions.list') {
      const functions = params?.name ? ALL.filter((entry) => entry.name === params.name) : ALL
      return envelope({ ipcAvailable: true, functions })
    }
    return envelope(answers[method])
  })
}

function run(
  command: 'app functions' | 'app invoke',
  flags: [string, string | boolean][],
  call: ReturnType<typeof fakeClient>,
  options: { json?: boolean; cwd?: string } = {}
) {
  return APP_FUNCTION_HANDLERS[command]!({
    client: { call } as never,
    cwd: options.cwd ?? process.cwd(),
    flags: new Map(flags),
    json: options.json ?? true
  })
}

afterEach(() => vi.restoreAllMocks())

describe('orca app functions', () => {
  it('hides RPC methods other commands already cover unless --all is passed', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    await run('app functions', [], fakeClient())
    await run('app functions', [['all', true]], fakeClient())

    const names = (index: number) =>
      JSON.parse(String(log.mock.calls[index][0])).result.functions.map(
        (entry: AppFunction) => entry.name
      )
    expect(names(0)).toEqual(['mobile:revokeRuntimeAccess', 'pairing.getEndpoints', 'files.watch'])
    expect(names(1)).toEqual(ALL.map((entry) => entry.name))
  })

  it('filters by kind and by name or window.api member', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    await run(
      'app functions',
      [
        ['filter', 'MOBILE.revoke'],
        ['kind', 'ipc']
      ],
      fakeClient(),
      { json: false }
    )

    expect(log.mock.calls[0][0]).toBe(
      'ipc  mobile:revokeRuntimeAccess(args: { deviceId: string; })  <- window.api.mobile.revokeRuntimeAccess\n' +
        '1 function(s). Run with --json for argument types and sources.'
    )
  })

  it('rejects an unknown --kind', async () => {
    await expect(run('app functions', [['kind', 'renderer']], fakeClient())).rejects.toThrow(
      '--kind must be ipc or rpc'
    )
  })
})

describe('orca app invoke', () => {
  it('sends IPC arguments positionally and prints the value', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const call = fakeClient({ 'appFunctions.invokeIpc': { ok: true, value: { revoked: true } } })

    await run(
      'app invoke',
      [
        ['name', 'mobile:revokeRuntimeAccess'],
        ['args', '[{"deviceId":"d1"}]']
      ],
      call,
      { json: false }
    )

    expect(call).toHaveBeenCalledWith('appFunctions.invokeIpc', {
      channel: 'mobile:revokeRuntimeAccess',
      args: [{ deviceId: 'd1' }]
    })
    expect(log).toHaveBeenCalledWith(JSON.stringify({ revoked: true }, null, 2))
  })

  it('reads the arguments from --args-file', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const cwd = await mkdtemp(join(tmpdir(), 'orca-app-invoke-'))
    await writeFile(join(cwd, 'args.json'), '[{"deviceId":"d2"}]', 'utf8')
    const call = fakeClient({ 'appFunctions.invokeIpc': { ok: true, value: null } })

    await run(
      'app invoke',
      [
        ['name', 'mobile:revokeRuntimeAccess'],
        ['args-file', 'args.json']
      ],
      call,
      { cwd }
    )

    expect(call).toHaveBeenCalledWith('appFunctions.invokeIpc', {
      channel: 'mobile:revokeRuntimeAccess',
      args: [{ deviceId: 'd2' }]
    })
  })

  it('validates --args before reaching the app', async () => {
    const call = fakeClient()
    const invoke = (flags: [string, string][]) =>
      run('app invoke', [['name', 'mobile:revokeRuntimeAccess'], ...flags], call)

    await expect(invoke([['args', '[{"deviceId":']])).rejects.toThrow('--args is not valid JSON')
    await expect(invoke([['args', '{"deviceId":"d1"}']])).rejects.toThrow(
      'takes positional arguments: pass --args as a JSON array'
    )
    await expect(
      invoke([
        ['args', '[]'],
        ['args-file', 'a.json']
      ])
    ).rejects.toThrow('Use either --args or --args-file')
    expect(call).not.toHaveBeenCalledWith('appFunctions.invokeIpc', expect.anything())
  })

  it('names close matches for an unknown function', async () => {
    await expect(
      run('app invoke', [['name', 'revokeRuntimeAccess']], fakeClient())
    ).rejects.toMatchObject({
      code: 'invalid_argument',
      data: { suggestions: ['mobile:revokeRuntimeAccess'] }
    })
  })

  it('exits with the function error when the handler throws', async () => {
    const error = { name: 'Error', message: 'grant not found' }
    const call = fakeClient({ 'appFunctions.invokeIpc': { ok: false, error } })

    await expect(
      run(
        'app invoke',
        [
          ['name', 'mobile:revokeRuntimeAccess'],
          ['args', '[{"deviceId":"gone"}]']
        ],
        call
      )
    ).rejects.toMatchObject({
      code: 'app_function_failed',
      message: 'mobile:revokeRuntimeAccess failed: Error: grant not found',
      data: { error }
    })
  })

  it('calls an RPC method directly with the params object', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const call = fakeClient({ 'pairing.getEndpoints': { endpoints: [] } })

    await run(
      'app invoke',
      [
        ['name', 'pairing.getEndpoints'],
        ['args', '{"scope":"runtime"}']
      ],
      call
    )

    expect(call).toHaveBeenCalledWith('pairing.getEndpoints', { scope: 'runtime' })
    expect(JSON.parse(String(log.mock.calls[0][0])).result).toEqual({ endpoints: [] })
  })

  it('refuses a streaming RPC method', async () => {
    await expect(run('app invoke', [['name', 'files.watch']], fakeClient())).rejects.toThrow(
      'streaming RPC method'
    )
  })
})
