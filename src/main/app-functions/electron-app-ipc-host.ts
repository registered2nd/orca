import type { IpcMain, IpcMainInvokeEvent, WebContents } from 'electron'
import { AppIpcUnreachableError, type AppIpcHost } from './app-ipc-host'

// Why Electron's own table: it is what renderer invokes dispatch through, so it holds every handler
// registered so far — including ones registered before any wrapper could have been installed.
function invokeHandlerTable(ipc: IpcMain): ReadonlyMap<unknown, unknown> {
  const table = '_invokeHandlers' in ipc ? ipc._invokeHandlers : undefined
  if (!(table instanceof Map)) {
    throw new AppIpcUnreachableError(
      'app_ipc_unavailable',
      'This Electron build does not expose its IPC handler table.'
    )
  }
  return table
}

// Same fields Electron puts on the event of a renderer's main-frame invoke.
function mainFrameInvokeEvent(sender: WebContents): IpcMainInvokeEvent {
  let defaultPrevented = false
  return {
    type: 'frame',
    sender,
    senderFrame: sender.mainFrame,
    frameId: sender.mainFrame.routingId,
    processId: sender.mainFrame.processId,
    preventDefault: () => {
      defaultPrevented = true
    },
    get defaultPrevented() {
      return defaultPrevented
    }
  }
}

function requireSender(getSender: () => WebContents | null): WebContents {
  const sender = getSender()
  if (!sender || sender.isDestroyed()) {
    throw new AppIpcUnreachableError(
      'app_ipc_no_window',
      'The Orca window is not open, so there is no UI to call this function as.'
    )
  }
  return sender
}

export function createElectronAppIpcHost(options: {
  ipc: IpcMain
  getSender: () => WebContents | null
}): AppIpcHost {
  return {
    listChannels: () =>
      [...invokeHandlerTable(options.ipc)].flatMap(([channel, handler]) =>
        typeof channel === 'string' && typeof handler === 'function'
          ? [{ channel, handlerSource: Function.prototype.toString.call(handler) }]
          : []
      ),
    invoke: async (channel, args) => {
      const handler = invokeHandlerTable(options.ipc).get(channel)
      if (typeof handler !== 'function') {
        throw new AppIpcUnreachableError(
          'app_ipc_unknown_channel',
          `No IPC handler is registered for '${channel}'.`
        )
      }
      const sender = requireSender(options.getSender)
      // Why structuredClone: Electron hands handlers a structured-clone copy of the renderer's args.
      return await handler(mainFrameInvokeEvent(sender), ...structuredClone(args))
    },
    callRenderer: async (operation, args) => {
      const sender = requireSender(options.getSender)
      // Why JSON-encoded arguments: they are spliced into the script as literals, never as code.
      const call = `window.__orcaRendererActions.${operation}(${args.map((arg) => JSON.stringify(arg)).join(',')})`
      const result: unknown = await sender.executeJavaScript(
        `window.__orcaRendererActions ? Promise.resolve(${call}) : Promise.resolve(null)`,
        true
      )
      if (typeof result !== 'string') {
        throw new AppIpcUnreachableError(
          'app_renderer_bridge_missing',
          'The Orca window has not loaded its action bridge yet; retry once the window has started.'
        )
      }
      return result
    }
  }
}
