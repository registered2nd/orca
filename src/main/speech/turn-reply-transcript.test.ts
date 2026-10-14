import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readTurnReplyFromTranscript } from './turn-reply-transcript'

function transcript(lines: unknown[]): string {
  const path = join(mkdtempSync(join(tmpdir(), 'turn-reply-')), 't.jsonl')
  writeFileSync(path, lines.map((line) => JSON.stringify(line)).join('\n'))
  return path
}

describe('readTurnReplyFromTranscript', () => {
  it('joins every Claude text block since the prompt, across tool calls', () => {
    const path = transcript([
      { type: 'user', message: { content: 'old prompt' } },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'old reply' }] } },
      { type: 'user', message: { content: [{ type: 'text', text: 'new prompt' }] } },
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'First part.' },
            { type: 'tool_use', id: 't1' }
          ]
        }
      },
      { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1' }] } },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'Last part.' }] } }
    ])
    expect(readTurnReplyFromTranscript(path)).toBe('First part.\n\nLast part.')
  })

  it('reads Codex rollout messages', () => {
    const path = transcript([
      {
        type: 'response_item',
        payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'q' }] }
      },
      {
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Looking.' }]
        }
      },
      { type: 'response_item', payload: { type: 'function_call', name: 'x' } },
      {
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Done.' }]
        }
      }
    ])
    expect(readTurnReplyFromTranscript(path)).toBe('Looking.\n\nDone.')
  })

  it('returns null for a missing file or a turn with no text yet', () => {
    expect(readTurnReplyFromTranscript(join(tmpdir(), 'no-such-transcript.jsonl'))).toBeNull()
    expect(
      readTurnReplyFromTranscript(transcript([{ type: 'user', message: { content: 'q' } }]))
    ).toBeNull()
  })
})
