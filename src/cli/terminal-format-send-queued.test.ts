import { describe, expect, it } from 'vitest'
import { formatTerminalSend, terminalSendWarnings } from './terminal-format'

describe('formatTerminalSend queued stage', () => {
  it('reports a prompt a mid-turn agent took as queued, without a warning', () => {
    const send = {
      handle: 'term_worker',
      accepted: true,
      bytesWritten: 8,
      prompt: {
        requestId: 'prompt-queued',
        stages: ['input_accepted' as const, 'queued' as const],
        provider: 'claude' as const,
        observation: 'supported' as const,
        processIncarnation: 'inc-1',
        generation: 1,
        baselineWorkingSequence: 0
      }
    }
    const output = formatTerminalSend({ send })

    expect(output).toContain('input_accepted -> queued')
    expect(output).not.toContain('warning:')
    expect(terminalSendWarnings(send)).toEqual([])
  })
})
