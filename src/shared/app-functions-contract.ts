// What `orca app functions` lists and `orca app invoke` runs: the IPC channels the desktop UI calls in
// the main process, and the runtime RPC methods.

export type AppFunctionParam = {
  name: string
  // TypeScript source text of the declared type; null when the code declares none.
  type: string | null
  optional: boolean
  rest: boolean
}

export type AppFunctionPreloadBinding = {
  // How the renderer reaches it, e.g. `window.api.mobile.getRuntimePairingUrl`; null when the bridge
  // calls it from inside a helper rather than a named API member.
  api: string | null
  source: string
  params: AppFunctionParam[]
  returns: string | null
}

export type AppIpcFunction = {
  kind: 'ipc'
  name: string
  // Positional arguments after the IPC event; null when neither source nor the live handler names them.
  params: AppFunctionParam[] | null
  source: string | null
  preload: AppFunctionPreloadBinding | null
}

export type AppRpcFunction = {
  kind: 'rpc'
  name: string
  permission: string
  streaming: boolean
  // JSON Schema of the params object; null for a method that takes none.
  paramsSchema: unknown
  exposedByCli: boolean
}

export type AppFunction = AppIpcFunction | AppRpcFunction

export type AppFunctionsListResult = {
  // False when this runtime has no desktop window process (headless serve), so no IPC channels exist.
  ipcAvailable: boolean
  functions: AppFunction[]
}

export type AppIpcInvokeError = {
  name: string
  message: string
  code?: string
}

// Why a result union instead of an RPC failure: a handler that throws is the function's own answer
// (the UI sees it as a rejected invoke), distinct from the call failing to reach the handler.
export type AppIpcInvokeResult =
  | { ok: true; value: unknown }
  | { ok: false; error: AppIpcInvokeError }
