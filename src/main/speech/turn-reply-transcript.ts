import { closeSync, fstatSync, openSync, readSync } from 'node:fs'

// Why: transcripts grow to many MB; one turn's text is always near the end.
const TAIL_BYTES = 1024 * 1024

type Line = { role: 'user' | 'assistant' | 'other'; text: string }

function textBlocks(content: unknown, types: string[]): string[] {
  if (typeof content === 'string') {
    return [content]
  }
  if (!Array.isArray(content)) {
    return []
  }
  return content.flatMap((block: unknown) =>
    typeof block === 'object' &&
    block !== null &&
    'type' in block &&
    'text' in block &&
    types.includes(String(block.type)) &&
    typeof block.text === 'string'
      ? [block.text]
      : []
  )
}

function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined
}

/** Claude Code (`type`/`message`) and Codex (`response_item` payload) transcript lines. */
function classify(raw: string): Line {
  let entry: unknown
  try {
    entry = JSON.parse(raw)
  } catch {
    return { role: 'other', text: '' }
  }
  const type = field(entry, 'type')
  if (type === 'user' || type === 'assistant') {
    const texts = textBlocks(field(field(entry, 'message'), 'content'), ['text'])
    // A user line holding only tool results is part of the agent's turn, not a new prompt.
    return texts.length > 0 ? { role: type, text: texts.join('\n') } : { role: 'other', text: '' }
  }
  if (type === 'response_item') {
    const payload = field(entry, 'payload')
    const role = field(payload, 'role')
    if (field(payload, 'type') === 'message' && (role === 'user' || role === 'assistant')) {
      const texts = textBlocks(field(payload, 'content'), ['input_text', 'output_text'])
      return { role, text: texts.join('\n') }
    }
  }
  return { role: 'other', text: '' }
}

/** Every assistant text block since the latest user prompt, or null when the transcript can't say. */
export function readTurnReplyFromTranscript(path: string): string | null {
  if (!path.endsWith('.jsonl')) {
    return null
  }
  let fd: number
  try {
    fd = openSync(path, 'r')
  } catch {
    return null
  }
  try {
    const size = fstatSync(fd).size
    const start = Math.max(0, size - TAIL_BYTES)
    const buffer = Buffer.alloc(size - start)
    readSync(fd, buffer, 0, buffer.length, start)
    const lines = buffer.toString('utf8').split('\n')
    if (start > 0) {
      lines.shift()
    }
    const parts: string[] = []
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = classify(lines[i])
      if (line.role === 'user') {
        return parts.length > 0 ? parts.toReversed().join('\n\n') : null
      }
      if (line.role === 'assistant' && line.text.trim()) {
        parts.push(line.text.trim())
      }
    }
    return null
  } catch {
    return null
  } finally {
    closeSync(fd)
  }
}
