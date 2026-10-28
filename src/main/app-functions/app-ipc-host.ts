import type { RendererBridgeOperation } from '../../shared/renderer-app-actions-contract'

// Why a holder: the runtime RPC graph must stay Electron-free (check-runtime-electron-ratchet), so the
// desktop installs the IPC side here and a headless runtime simply has none.

export type AppIpcChannel = {
  channel: string
  // Compiled source of the live handler; names its parameters when the static catalog cannot.
  handlerSource: string
}

export type AppIpcHost = {
  listChannels(): AppIpcChannel[]
  // Calls the handler exactly as a renderer invoke would; a handler's own throw propagates unchanged.
  invoke(channel: string, args: readonly unknown[]): Promise<unknown>
  // Runs one operation of the window's renderer action bridge; resolves to its JSON answer text.
  callRenderer(operation: RendererBridgeOperation, args: readonly string[]): Promise<string>
}

// Thrown when the call cannot reach a handler at all, as opposed to the handler throwing.
export class AppIpcUnreachableError extends Error {
  readonly code:
    | 'app_ipc_unknown_channel'
    | 'app_ipc_no_window'
    | 'app_ipc_unavailable'
    | 'app_renderer_bridge_missing'

  constructor(code: AppIpcUnreachableError['code'], message: string) {
    super(message)
    this.name = 'AppIpcUnreachableError'
    this.code = code
  }
}

let host: AppIpcHost | null = null

export function setAppIpcHost(next: AppIpcHost | null): void {
  host = next
}

export function getAppIpcHost(): AppIpcHost | null {
  return host
}
