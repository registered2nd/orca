import type { IpcMain, WebContents } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { AppIpcUnreachableError } from './app-ipc-host'
import { createElectronAppIpcHost } from './electron-app-ipc-host'

function fakeIpc(handlers: Record<string, (...args: never[]) => unknown>): IpcMain {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the host reads only `_invokeHandlers`, as Electron's ipcMain holds it.
  return { _invokeHandlers: new Map(Object.entries(handlers)) } as unknown as IpcMain
}

function fakeSender(destroyed = false): WebContents {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: handlers under test read only these members.
  return {
    id: 7,
    isDestroyed: () => destroyed,
    mainFrame: { routingId: 3, processId: 11 }
  } as unknown as WebContents
}

describe('createElectronAppIpcHost', () => {
  it("lists Electron's registered invoke handlers with their source", () => {
    const host = createElectronAppIpcHost({
      ipc: fakeIpc({ 'demo:echo': (_event: never, value: never) => value }),
      getSender: () => null
    })

    expect(host.listChannels()).toEqual([
      { channel: 'demo:echo', handlerSource: expect.stringContaining('value') }
    ])
  })

  it('calls the handler with a main-frame event from the window and cloned arguments', async () => {
    const handler = vi.fn((_event: unknown, payload: { n: number }) => payload.n + 1)
    const sender = fakeSender()
    const payload = { n: 1 }
    const host = createElectronAppIpcHost({
      ipc: fakeIpc({ 'demo:inc': handler }),
      getSender: () => sender
    })

    await expect(host.invoke('demo:inc', [payload])).resolves.toBe(2)
    const [event, received] = handler.mock.calls[0]
    expect(event).toMatchObject({
      type: 'frame',
      sender,
      senderFrame: sender.mainFrame,
      frameId: 3,
      processId: 11,
      defaultPrevented: false
    })
    expect(received).toEqual(payload)
    expect(received).not.toBe(payload)
  })

  it('lets a handler throw through unchanged', async () => {
    const failure = new Error('boom')
    const host = createElectronAppIpcHost({
      ipc: fakeIpc({
        'demo:fail': () => {
          throw failure
        }
      }),
      getSender: () => fakeSender()
    })

    await expect(host.invoke('demo:fail', [])).rejects.toBe(failure)
  })

  it('refuses an unknown channel and a missing or closed window', async () => {
    const host = createElectronAppIpcHost({
      ipc: fakeIpc({ 'demo:ok': () => 1 }),
      getSender: () => fakeSender(true)
    })

    await expect(host.invoke('demo:missing', [])).rejects.toMatchObject({
      code: 'app_ipc_unknown_channel'
    })
    await expect(host.invoke('demo:ok', [])).rejects.toMatchObject({ code: 'app_ipc_no_window' })
  })

  it('reports an Electron build that hides its handler table', () => {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: an ipcMain without the private table.
    const host = createElectronAppIpcHost({ ipc: {} as IpcMain, getSender: () => null })

    expect(() => host.listChannels()).toThrow(AppIpcUnreachableError)
  })
})
