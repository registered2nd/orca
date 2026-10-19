import type { AppFunction, AppFunctionParam } from '../shared/app-functions-contract'

function paramSignature(param: AppFunctionParam): string {
  const name = `${param.rest ? '...' : ''}${param.name}${param.optional && !param.rest ? '?' : ''}`
  return param.type ? `${name}: ${param.type}` : name
}

function schemaKeys(schema: unknown): string {
  if (schema === null) {
    return '(no params)'
  }
  const properties =
    typeof schema === 'object' && 'properties' in schema && typeof schema.properties === 'object'
      ? schema.properties
      : null
  return properties ? `{ ${Object.keys(properties).join(', ')} }` : '(params)'
}

export function formatAppFunctionLine(entry: AppFunction): string {
  if (entry.kind === 'rpc') {
    return `rpc  ${entry.name} ${schemaKeys(entry.paramsSchema)}${entry.streaming ? ' [streaming]' : ''}`
  }
  const params = entry.params ? entry.params.map(paramSignature).join(', ') : '?'
  const via = entry.preload?.api ? `  <- ${entry.preload.api}` : ''
  return `ipc  ${entry.name}(${params})${via}`
}

export function formatAppFunctionList(entries: AppFunction[], ipcAvailable: boolean): string {
  const lines = entries.map(formatAppFunctionLine)
  if (!ipcAvailable) {
    lines.unshift('(this Orca runtime has no desktop window, so it has no IPC functions)')
  }
  lines.push(`${entries.length} function(s). Run with --json for argument types and sources.`)
  return lines.join('\n')
}
