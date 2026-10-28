import type { AppIpcInvokeResult } from '../../shared/app-functions-contract'
import type {
  RendererActionsListResult,
  RendererTerminalTab,
  RendererTerminalsLoadOutcome,
  RendererTerminalsLoadResult
} from '../../shared/renderer-app-actions-contract'
import { AppIpcUnreachableError, type AppIpcHost } from './app-ipc-host'

function requireHost(host: AppIpcHost | null): AppIpcHost {
  if (!host) {
    throw new Error('This Orca runtime has no desktop window process, so it has no UI actions.')
  }
  return host
}

async function callRenderer<T>(
  host: AppIpcHost | null,
  operation: Parameters<AppIpcHost['callRenderer']>[0],
  args: readonly string[] = []
): Promise<T> {
  try {
    // SAFETY: the bridge answers each operation with the JSON of that operation's contract type.
    return JSON.parse(await requireHost(host).callRenderer(operation, args)) as T
  } catch (error) {
    throw error instanceof AppIpcUnreachableError ? new Error(error.message) : error
  }
}

export function listRendererActions(host: AppIpcHost | null): Promise<RendererActionsListResult> {
  return callRenderer(host, 'list')
}

export async function invokeRendererAction(
  host: AppIpcHost | null,
  name: string,
  args: readonly unknown[]
): Promise<AppIpcInvokeResult> {
  const { actions } = await listRendererActions(host)
  if (!actions.some((action) => action.name === name)) {
    throw new Error(`No renderer action named '${name}'. Run \`orca app ui actions\` for the list.`)
  }
  try {
    return { ok: true, value: await callRenderer(host, 'invoke', [name, JSON.stringify(args)]) }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: { name: 'Error', message } }
  }
}

export function readRendererState(host: AppIpcHost | null, path: string): Promise<unknown> {
  return callRenderer(host, 'state', [path])
}

export function listRendererTerminalTabs(host: AppIpcHost | null): Promise<RendererTerminalTab[]> {
  return callRenderer(host, 'terminalTabs')
}

const REQUEST_AGAIN_EVERY_POLLS = 8

// Asks the window to mount every unloaded tab, then waits up to waitMs for each to attach a PTY.
// Why ask again: right after a restart the window can drop a request while it is still settling.
export async function loadAllRendererTerminals(
  host: AppIpcHost | null,
  waitMs: number,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))
): Promise<RendererTerminalsLoadOutcome> {
  const requested = await callRenderer<RendererTerminalsLoadResult>(host, 'loadTerminals')
  const deadline = Date.now() + waitMs
  let unloaded = requested.unloadedTabIds
  for (let poll = 1; unloaded.length > 0 && Date.now() < deadline; poll += 1) {
    await sleep(250)
    if (poll % REQUEST_AGAIN_EVERY_POLLS === 0) {
      unloaded = (await callRenderer<RendererTerminalsLoadResult>(host, 'loadTerminals'))
        .unloadedTabIds
      continue
    }
    const tabs = await listRendererTerminalTabs(host)
    unloaded = tabs.filter((tab) => !tab.loaded).map((tab) => tab.tabId)
  }
  return { ...requested, stillUnloadedTabIds: unloaded }
}
