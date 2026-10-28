import { readFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import type {
  AppFunction,
  AppFunctionsListResult,
  AppIpcInvokeResult
} from '../../shared/app-functions-contract'
import type {
  RendererActionsListResult,
  RendererTerminalTab,
  RendererTerminalsLoadOutcome
} from '../../shared/renderer-app-actions-contract'
import type { CommandHandler, HandlerContext } from '../dispatch'
import { formatAppFunctionList } from '../app-functions-format'
import {
  getOptionalJsonFlag,
  getOptionalNonNegativeIntegerFlag,
  getOptionalStringFlag,
  getRequiredStringFlag
} from '../flags'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'

type Kind = AppFunction['kind']

function kindFlag(ctx: HandlerContext): Kind | undefined {
  const kind = getOptionalStringFlag(ctx.flags, 'kind')
  if (kind === undefined || kind === 'ipc' || kind === 'rpc') {
    return kind
  }
  throw new RuntimeClientError('invalid_argument', `--kind must be ipc or rpc, not '${kind}'.`)
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    throw new RuntimeClientError(
      'invalid_argument',
      '--args-file - reads stdin, but stdin is a TTY.'
    )
  }
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function argsJson(ctx: HandlerContext): Promise<string | undefined> {
  const inline = getOptionalJsonFlag(ctx.flags, 'args')
  const file = getOptionalStringFlag(ctx.flags, 'args-file')
  if (inline !== undefined && file !== undefined) {
    throw new RuntimeClientError('invalid_argument', 'Use either --args or --args-file, not both.')
  }
  if (file === undefined) {
    return inline
  }
  return file === '-'
    ? readStdin()
    : readFile(isAbsolute(file) ? file : join(ctx.cwd, file), 'utf8')
}

// Exported for tests: the parsed --args value, or undefined when none was given.
export async function readInvokeArgs(ctx: HandlerContext): Promise<unknown> {
  const raw = await argsJson(ctx)
  if (raw === undefined) {
    return undefined
  }
  try {
    return JSON.parse(raw)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new RuntimeClientError('invalid_argument', `--args is not valid JSON: ${reason}`)
  }
}

function suggestionsFor(name: string, functions: AppFunction[]): string[] {
  const needle = name.toLowerCase()
  const tail = needle.split(/[:.]/).at(-1) ?? needle
  return functions
    .map((entry) => entry.name)
    .filter((candidate) => {
      const lower = candidate.toLowerCase()
      return lower.includes(needle) || (tail.length >= 3 && lower.includes(tail))
    })
    .slice(0, 8)
}

async function resolveFunction(ctx: HandlerContext, name: string): Promise<AppFunction> {
  const kind = kindFlag(ctx)
  const listed = await ctx.client.call<AppFunctionsListResult>('appFunctions.list', { name })
  const matches = listed.result.functions.filter((entry) => !kind || entry.kind === kind)
  if (matches.length === 1) {
    return matches[0]
  }
  if (matches.length > 1) {
    throw new RuntimeClientError(
      'invalid_argument',
      `'${name}' is both an IPC channel and an RPC method; pass --kind ipc or --kind rpc.`
    )
  }
  const all = await ctx.client.call<AppFunctionsListResult>('appFunctions.list')
  const suggestions = suggestionsFor(name, all.result.functions)
  const scope = kind ? ` (kind ${kind})` : ''
  const hint = suggestions.length ? ` Did you mean: ${suggestions.join(', ')}?` : ''
  throw new RuntimeClientError(
    'invalid_argument',
    `Unknown app function: ${name}${scope}.${hint} Run \`orca app functions --all\` for the full list.`,
    { suggestions }
  )
}

function printValue(ctx: HandlerContext, response: { result: unknown }, value: unknown): void {
  if (ctx.json) {
    console.log(JSON.stringify(response, null, 2))
    return
  }
  console.log(typeof value === 'string' ? value : JSON.stringify(value ?? null, null, 2))
}

export const APP_FUNCTION_HANDLERS: Record<string, CommandHandler> = {
  'app functions': async (ctx) => {
    const kind = kindFlag(ctx)
    const filter = getOptionalStringFlag(ctx.flags, 'filter')?.toLowerCase()
    const includeCovered = ctx.flags.get('all') === true
    const response = await ctx.client.call<AppFunctionsListResult>('appFunctions.list')
    const functions = response.result.functions.filter(
      (entry) =>
        (!kind || entry.kind === kind) &&
        (includeCovered || entry.kind === 'ipc' || !entry.exposedByCli) &&
        (!filter ||
          entry.name.toLowerCase().includes(filter) ||
          (entry.kind === 'ipc' && (entry.preload?.api ?? '').toLowerCase().includes(filter)))
    )
    printResult({ ...response, result: { ...response.result, functions } }, ctx.json, (result) =>
      formatAppFunctionList(result.functions, result.ipcAvailable)
    )
  },
  'app invoke': async (ctx) => {
    const name = getRequiredStringFlag(ctx.flags, 'name')
    const args = await readInvokeArgs(ctx)
    const target = await resolveFunction(ctx, name)
    if (target.kind === 'rpc') {
      if (target.streaming) {
        throw new RuntimeClientError(
          'invalid_argument',
          `'${name}' is a streaming RPC method; app invoke runs only one-shot functions.`
        )
      }
      const response = await ctx.client.call(name, args)
      printValue(ctx, response, response.result)
      return
    }
    if (args !== undefined && !Array.isArray(args)) {
      throw new RuntimeClientError(
        'invalid_argument',
        `IPC function '${name}' takes positional arguments: pass --args as a JSON array, e.g. '[${JSON.stringify(args)}]'.`
      )
    }
    const response = await ctx.client.call<AppIpcInvokeResult>('appFunctions.invokeIpc', {
      channel: name,
      args: args ?? []
    })
    const outcome = response.result
    if (!outcome.ok) {
      throw new RuntimeClientError(
        'app_function_failed',
        `${name} failed: ${outcome.error.name}: ${outcome.error.message}`,
        { error: outcome.error }
      )
    }
    printValue(ctx, response, outcome.value)
  },
  'app ui actions': async (ctx) => {
    const filter = getOptionalStringFlag(ctx.flags, 'filter')?.toLowerCase()
    const matches = (name: string): boolean => !filter || name.toLowerCase().includes(filter)
    const response = await ctx.client.call<RendererActionsListResult>('appUi.listActions')
    const result = {
      actions: response.result.actions.filter((action) => matches(action.name)),
      stateKeys: response.result.stateKeys.filter(matches)
    }
    printResult({ ...response, result }, ctx.json, (listed) =>
      [
        `Actions (${listed.actions.length}):`,
        ...listed.actions.map((action) => `  ${action.name} (${action.arity} args)`),
        `State (${listed.stateKeys.length}):`,
        ...listed.stateKeys.map((key) => `  ${key}`)
      ].join('\n')
    )
  },
  'app ui invoke': async (ctx) => {
    const name = getRequiredStringFlag(ctx.flags, 'name')
    const args = await readInvokeArgs(ctx)
    if (args !== undefined && !Array.isArray(args)) {
      throw new RuntimeClientError(
        'invalid_argument',
        `Window action '${name}' takes positional arguments: pass --args as a JSON array.`
      )
    }
    const response = await ctx.client.call<AppIpcInvokeResult>('appUi.invoke', {
      name,
      args: args ?? []
    })
    const outcome = response.result
    if (!outcome.ok) {
      throw new RuntimeClientError(
        'app_function_failed',
        `${name} failed: ${outcome.error.message}`,
        { error: outcome.error }
      )
    }
    printValue(ctx, response, outcome.value)
  },
  'app ui state': async (ctx) => {
    const path = getOptionalStringFlag(ctx.flags, 'path') ?? ''
    const response = await ctx.client.call<{ value: unknown }>('appUi.state', { path })
    printValue(ctx, response, response.result.value)
  },
  'app terminals list': async (ctx) => {
    const onlyUnloaded = ctx.flags.get('unloaded') === true
    const response = await ctx.client.call<{ tabs: RendererTerminalTab[] }>('appUi.terminalTabs')
    const tabs = response.result.tabs.filter((tab) => !onlyUnloaded || !tab.loaded)
    printResult({ ...response, result: { tabs } }, ctx.json, (listed) =>
      listed.tabs.length === 0
        ? 'No terminal tabs.'
        : listed.tabs
            .map(
              (tab) =>
                `${tab.loaded ? 'loaded  ' : 'unloaded'} ${tab.focused ? '*' : ' '} ${tab.tabId}  ${tab.title}  [${tab.worktreeId}]`
            )
            .join('\n')
    )
  },
  'app terminals load': async (ctx) => {
    const waitMs = getOptionalNonNegativeIntegerFlag(ctx.flags, 'wait-ms') ?? 30_000
    const response = await ctx.client.call<RendererTerminalsLoadOutcome>(
      'appUi.loadTerminals',
      { waitMs },
      { timeoutMs: waitMs + 30_000 }
    )
    const outcome = response.result
    if (outcome.stillUnloadedTabIds.length > 0) {
      throw new RuntimeClientError(
        'terminals_not_loaded',
        `${outcome.stillUnloadedTabIds.length} of ${outcome.totalTabs} terminal tabs did not load within ${waitMs} ms: ${outcome.stillUnloadedTabIds.join(', ')}`,
        outcome
      )
    }
    printResult(response, ctx.json, () =>
      outcome.unloadedTabIds.length === 0
        ? `All ${outcome.totalTabs} terminal tabs were already loaded.`
        : `Loaded ${outcome.unloadedTabIds.length} terminal tabs across ${outcome.requestedWorktreeIds.length} workspaces; all ${outcome.totalTabs} are loaded.`
    )
  },
  'app terminals activate': async (ctx) => {
    const tabId = getRequiredStringFlag(ctx.flags, 'tab')
    const listed = await ctx.client.call<{ tabs: RendererTerminalTab[] }>('appUi.terminalTabs')
    const tab = listed.result.tabs.find((entry) => entry.tabId === tabId)
    if (!tab) {
      throw new RuntimeClientError(
        'invalid_argument',
        `No terminal tab ${tabId}. Run \`orca app terminals list\` for the tabs.`
      )
    }
    const response = await ctx.client.call('session.tabs.activate', {
      worktree: `id:${tab.worktreeId}`,
      tabId
    })
    printResult(response, ctx.json, () => `Activated ${tabId} in ${tab.worktreeId}.`)
  }
}
