// Why: IPC results are structured-clone values (Uint8Array, Map, Date, undefined…); the RPC wire is
// JSON, which would silently turn a Map into {} and bytes into an index-keyed object.
export function toAppFunctionJsonValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === undefined) {
    return null
  }
  if (typeof value === 'bigint') {
    return value.toString()
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return String(value)
  }
  if (value === null || typeof value !== 'object') {
    return typeof value === 'function' || typeof value === 'symbol' ? null : value
  }
  if (seen.has(value)) {
    return '[Circular]'
  }
  seen.add(value)
  try {
    if (value instanceof Date) {
      return value.toISOString()
    }
    if (ArrayBuffer.isView(value)) {
      return {
        $bytes: Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('base64')
      }
    }
    if (value instanceof ArrayBuffer) {
      return { $bytes: Buffer.from(value).toString('base64') }
    }
    if (value instanceof Map) {
      return {
        $map: [...value].map(([key, entry]) => [
          toAppFunctionJsonValue(key, seen),
          toAppFunctionJsonValue(entry, seen)
        ])
      }
    }
    if (value instanceof Set) {
      return { $set: [...value].map((entry) => toAppFunctionJsonValue(entry, seen)) }
    }
    if (value instanceof Error) {
      return { name: value.name, message: value.message }
    }
    if (Array.isArray(value)) {
      return value.map((entry) => toAppFunctionJsonValue(entry, seen))
    }
    const out: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value)) {
      if (entry !== undefined && typeof entry !== 'function') {
        out[key] = toAppFunctionJsonValue(entry, seen)
      }
    }
    return out
  } finally {
    seen.delete(value)
  }
}
