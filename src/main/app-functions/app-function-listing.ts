import { z, type ZodType } from 'zod'
import type {
  AppFunction,
  AppFunctionParam,
  AppFunctionsListResult,
  AppIpcFunction,
  AppIpcInvokeResult,
  AppRpcFunction
} from '../../shared/app-functions-contract'
import { InvalidArgumentError } from '../runtime/rpc/core'
import { AppIpcUnreachableError, type AppIpcHost } from './app-ipc-host'
import { toAppFunctionJsonValue } from './app-function-json-value'
import { ipcHandlerParamsFromSource } from './ipc-handler-source-params'
import catalogJson from './app-functions-catalog.generated.json'

const ParamSchema = z.object({
  name: z.string(),
  type: z.string().nullable(),
  optional: z.boolean(),
  rest: z.boolean()
})
const CatalogSchema = z.object({
  ipc: z.record(
    z.string(),
    z.object({
      source: z.string().nullable(),
      params: z.array(ParamSchema).nullable(),
      preload: z
        .object({
          api: z.string().nullable(),
          source: z.string(),
          params: z.array(ParamSchema),
          returns: z.string().nullable()
        })
        .nullable()
    })
  ),
  cliRpcMethods: z.array(z.string())
})

let catalog: z.infer<typeof CatalogSchema> | null = null
function appFunctionsCatalog(): z.infer<typeof CatalogSchema> {
  catalog ??= CatalogSchema.parse(catalogJson)
  return catalog
}

export type ListedRpcMethod = {
  readonly name: string
  readonly permission: string
  readonly params: ZodType | null
}

function rpcParamsSchema(params: ZodType | null): unknown {
  if (params === null) {
    return null
  }
  try {
    return z.toJSONSchema(params, { io: 'input', unrepresentable: 'any' })
  } catch {
    // Why `{}`: null would read as "takes no params"; an empty schema says "any value".
    return {}
  }
}

// Why cached: the registry is fixed for the process and converting ~600 schemas is not free.
const rpcFunctionsByRegistry = new WeakMap<readonly ListedRpcMethod[], AppRpcFunction[]>()
function listRpcFunctions(methods: readonly ListedRpcMethod[]): AppRpcFunction[] {
  let rpcFunctions = rpcFunctionsByRegistry.get(methods)
  if (!rpcFunctions) {
    const exposed = new Set(appFunctionsCatalog().cliRpcMethods)
    rpcFunctions = methods.map((method) => ({
      kind: 'rpc' as const,
      name: method.name,
      permission: method.permission,
      streaming: 'stream' in method && method.stream === true,
      paramsSchema: rpcParamsSchema(method.params),
      exposedByCli: exposed.has(method.name)
    }))
    rpcFunctionsByRegistry.set(methods, rpcFunctions)
  }
  return rpcFunctions
}

function declaredParams(channel: string, handlerSource: string): AppFunctionParam[] | null {
  return appFunctionsCatalog().ipc[channel]?.params ?? ipcHandlerParamsFromSource(handlerSource)
}

function listIpcFunctions(host: AppIpcHost): AppIpcFunction[] {
  return host.listChannels().map(({ channel, handlerSource }) => {
    const entry = appFunctionsCatalog().ipc[channel]
    return {
      kind: 'ipc' as const,
      name: channel,
      params: declaredParams(channel, handlerSource),
      source: entry?.source ?? null,
      preload: entry?.preload ?? null
    }
  })
}

export function listAppFunctions(options: {
  host: AppIpcHost | null
  rpcMethods: readonly ListedRpcMethod[]
  name?: string
}): AppFunctionsListResult {
  const functions: AppFunction[] = [
    ...(options.host ? listIpcFunctions(options.host) : []),
    ...listRpcFunctions(options.rpcMethods)
  ]
    .filter((entry) => options.name === undefined || entry.name === options.name)
    .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))
  return { ipcAvailable: options.host !== null, functions }
}

function argumentCountRefusal(
  channel: string,
  params: AppFunctionParam[],
  count: number
): string | null {
  const names = params.map((param) => param.name).join(', ')
  if (!params.some((param) => param.rest) && count > params.length) {
    return `'${channel}' takes at most ${params.length} argument(s) (${names || 'none'}); got ${count}.`
  }
  const required = params.findLastIndex((param) => !param.optional) + 1
  return count < required
    ? `'${channel}' needs at least ${required} argument(s) (${names}); got ${count}.`
    : null
}

function describeThrown(error: unknown): { name: string; message: string; code?: string } {
  if (!(error instanceof Error)) {
    return { name: 'Error', message: String(error) }
  }
  const code = 'code' in error && typeof error.code === 'string' ? error.code : undefined
  return { name: error.name, message: error.message, ...(code ? { code } : {}) }
}

export async function invokeAppIpcFunction(
  host: AppIpcHost | null,
  channel: string,
  args: readonly unknown[]
): Promise<AppIpcInvokeResult> {
  if (!host) {
    throw new Error('This Orca runtime has no desktop window process, so it has no UI functions.')
  }
  const live = host.listChannels().find((entry) => entry.channel === channel)
  if (!live) {
    throw new InvalidArgumentError(`No IPC handler is registered for '${channel}'.`)
  }
  const params = declaredParams(channel, live.handlerSource)
  const refusal = params ? argumentCountRefusal(channel, params, args.length) : null
  if (refusal) {
    throw new InvalidArgumentError(refusal)
  }
  let value: unknown
  try {
    value = await host.invoke(channel, args)
  } catch (error) {
    if (error instanceof AppIpcUnreachableError) {
      throw error.code === 'app_ipc_unknown_channel'
        ? new InvalidArgumentError(error.message)
        : new Error(error.message)
    }
    return { ok: false, error: describeThrown(error) }
  }
  return { ok: true, value: toAppFunctionJsonValue(value) }
}
