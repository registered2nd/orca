import { describe, expect, it } from 'vitest'
import {
  buildTerminalSelectionAskPrompt,
  cleanTerminalSelection
} from './terminal-selection-ask-prompt'

describe('cleanTerminalSelection', () => {
  it('drops box borders and the common indent', () => {
    const text = ['╭──────────╮', '│  first   │', '│    inner │', '╰──────────╯'].join('\n')
    expect(cleanTerminalSelection(text, null)).toBe('first\n  inner')
  })

  it('removes the reply bullet and rejoins prose the TUI wrapped', () => {
    const columns = 40
    const text = [
      '● The release job rebuilds each tag and',
      '  publishes it to the fork, so the app',
      '  updates itself.',
      '',
      '  Next paragraph.'
    ].join('\n')
    expect(cleanTerminalSelection(text, columns)).toBe(
      'The release job rebuilds each tag and publishes it to the fork, so the app updates itself.\n\nNext paragraph.'
    )
  })

  it('keeps short lines, list items and fenced code as they are', () => {
    const columns = 30
    const text = [
      '- a list item that is long enough',
      '- second item',
      '```',
      'const longEnoughCodeLineHere = 1',
      'const next = 2',
      '```'
    ].join('\n')
    expect(cleanTerminalSelection(text, columns)).toBe(text)
  })

  it('continues a wrapped list item under its marker', () => {
    const text = ['- one two three four five six', '  seven'].join('\n')
    expect(cleanTerminalSelection(text, 32)).toBe('- one two three four five six seven')
  })

  it('joins wrapped Chinese without inserting a space', () => {
    const text = ['● 这是一段很长的中文句子需要换行', '  继续写完'].join('\n')
    expect(cleanTerminalSelection(text, 34)).toBe('这是一段很长的中文句子需要换行继续写完')
  })
})

describe('buildTerminalSelectionAskPrompt', () => {
  it('puts the question first and quotes the selection', () => {
    expect(
      buildTerminalSelectionAskPrompt({
        question: ' why? ',
        selection: 'line one\n\nline two',
        fromTargetsOwnOutput: true,
        sourceTitle: null
      })
    ).toBe(
      'why?\n\nAbout this part of your output, which I selected in the terminal:\n\n> line one\n>\n> line two'
    )
  })

  it('names another terminal the selection came from', () => {
    expect(
      buildTerminalSelectionAskPrompt({
        question: 'what failed?',
        selection: 'error',
        fromTargetsOwnOutput: false,
        sourceTitle: 'build'
      })
    ).toContain('selected in another terminal ("build"):')
  })
})
