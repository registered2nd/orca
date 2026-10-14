import { describe, expect, it } from 'vitest'
import type { AgentStatusEntry } from '../../../../shared/agent-status-types'
import { finishedTurnReply, startedNewTurn } from './speak-replies-trigger'

function entry(overrides: Partial<AgentStatusEntry>): AgentStatusEntry {
  return {
    state: 'working',
    prompt: '',
    updatedAt: 2000,
    stateStartedAt: 2000,
    paneKey: 'tab:leaf',
    stateHistory: [],
    ...overrides
  }
}

describe('finishedTurnReply', () => {
  const working = entry({ state: 'working' })

  it('returns the reply when a turn finishes', () => {
    expect(
      finishedTurnReply(entry({ state: 'done', lastAssistantMessage: ' Hi ' }), working, 1000)
    ).toBe('Hi')
  })

  it('ignores repeats, restored rows, interrupts, tool output and boundaries', () => {
    const done = entry({ state: 'done', lastAssistantMessage: 'Hi' })
    expect(finishedTurnReply(done, done, 1000)).toBeNull()
    expect(finishedTurnReply(done, working, 3000)).toBeNull()
    expect(finishedTurnReply({ ...done, restoredUnconfirmed: true }, working, 1000)).toBeNull()
    expect(finishedTurnReply({ ...done, interrupted: true }, working, 1000)).toBeNull()
    expect(
      finishedTurnReply({ ...done, lastAssistantMessageIsToolOutput: true }, working, 1000)
    ).toBeNull()
    expect(finishedTurnReply({ ...done, sessionBoundary: true }, working, 1000)).toBeNull()
    expect(finishedTurnReply(entry({ state: 'done' }), working, 1000)).toBeNull()
  })
})

describe('startedNewTurn', () => {
  it('is true only on the edge into working', () => {
    expect(startedNewTurn(entry({ state: 'working' }), entry({ state: 'done' }))).toBe(true)
    expect(startedNewTurn(entry({ state: 'working' }), entry({ state: 'working' }))).toBe(false)
  })
})
