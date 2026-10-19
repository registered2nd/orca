import type { AppFunctionParam } from '../../shared/app-functions-contract'

const OPENERS: Record<string, string> = { '(': ')', '[': ']', '{': '}' }

// Index just past the bracket that closes the one at `start`, skipping string and template contents.
function closingIndex(source: string, start: number): number {
  const stack: string[] = []
  let quote: string | null = null
  for (let index = start; index < source.length; index++) {
    const char = source[index]
    if (quote) {
      if (char === '\\') {
        index++
      } else if (char === quote) {
        quote = null
      }
      continue
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char
    } else if (OPENERS[char]) {
      stack.push(OPENERS[char])
    } else if (char === stack.at(-1)) {
      stack.pop()
      if (stack.length === 0) {
        return index + 1
      }
    }
  }
  return -1
}

function splitTopLevel(list: string): string[] {
  const parts: string[] = []
  let start = 0
  for (let index = 0; index < list.length; index++) {
    const char = list[index]
    if (OPENERS[char] || char === '"' || char === "'" || char === '`') {
      const end = closingIndexOfToken(list, index)
      if (end < 0) {
        break
      }
      index = end - 1
    } else if (char === ',') {
      parts.push(list.slice(start, index))
      start = index + 1
    }
  }
  parts.push(list.slice(start))
  return parts.map((part) => part.trim()).filter((part) => part.length > 0)
}

function closingIndexOfToken(source: string, start: number): number {
  const char = source[start]
  if (OPENERS[char]) {
    return closingIndex(source, start)
  }
  for (let index = start + 1; index < source.length; index++) {
    if (source[index] === '\\') {
      index++
    } else if (source[index] === char) {
      return index + 1
    }
  }
  return -1
}

function toParam(text: string): AppFunctionParam {
  const rest = text.startsWith('...')
  const body = rest ? text.slice(3) : text
  const defaultAt = splitTopLevelOnce(body, '=')
  return {
    name: (defaultAt < 0 ? body : body.slice(0, defaultAt)).trim(),
    type: null,
    optional: rest || defaultAt >= 0,
    rest
  }
}

function splitTopLevelOnce(text: string, separator: string): number {
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (OPENERS[char] || char === '"' || char === "'" || char === '`') {
      const end = closingIndexOfToken(text, index)
      if (end < 0) {
        return -1
      }
      index = end - 1
    } else if (char === separator && text[index + 1] !== '>') {
      return index
    }
  }
  return -1
}

/**
 * The arguments a compiled IPC handler takes after its event, read from `Function#toString`. Types
 * are gone after compilation, so only names, defaults and rest survive. Null when unparseable.
 */
export function ipcHandlerParamsFromSource(source: string): AppFunctionParam[] | null {
  const text = source.trim().replace(/^async\s+/, '')
  if (text.includes('[native code]')) {
    return null
  }
  // `event => …`: a lone unparenthesized parameter is the event itself.
  if (/^[A-Za-z_$][\w$]*\s*=>/.test(text)) {
    return []
  }
  const open = text.indexOf('(')
  if (open === -1) {
    return null
  }
  const close = closingIndex(text, open)
  if (close < 0) {
    return null
  }
  return splitTopLevel(text.slice(open + 1, close - 1))
    .slice(1)
    .map(toParam)
}
