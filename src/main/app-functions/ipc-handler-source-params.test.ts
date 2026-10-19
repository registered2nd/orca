import { describe, expect, it } from 'vitest'
import { ipcHandlerParamsFromSource } from './ipc-handler-source-params'

const names = (source: string): string[] | undefined =>
  ipcHandlerParamsFromSource(source)?.map((param) => param.name)

describe('ipcHandlerParamsFromSource', () => {
  it('drops the leading IPC event', () => {
    expect(names('(_event, args) => run(args)')).toEqual(['args'])
    expect(names('async (event, raw, rawScope) => { await x }')).toEqual(['raw', 'rawScope'])
    expect(names('function isDelayed() { return false }')).toEqual([])
    expect(names('event => event.sender.id')).toEqual([])
  })

  it('keeps destructured, defaulted and rest parameters whole', () => {
    expect(ipcHandlerParamsFromSource('(_e, { a, b = ")" }, limit = 10, ...rest) => 0')).toEqual([
      { name: '{ a, b = ")" }', type: null, optional: false, rest: false },
      { name: 'limit', type: null, optional: true, rest: false },
      { name: 'rest', type: null, optional: true, rest: true }
    ])
  })

  it('gives up on native or unparseable sources', () => {
    expect(ipcHandlerParamsFromSource('function () { [native code] }')).toBeNull()
    expect(ipcHandlerParamsFromSource('nonsense')).toBeNull()
  })
})
