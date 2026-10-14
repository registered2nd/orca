import { describe, expect, it } from 'vitest'
import {
  buildSpeechSsml,
  replyTextForSpeech,
  speechChunks,
  speechLanguageOf,
  speechSegments
} from './speech-reply-text'

describe('replyTextForSpeech', () => {
  it('drops code, tables and URLs and keeps link text and file names', () => {
    const md = [
      '## Result',
      '**Short answer:** the loss drops fast — then flattens.',
      '```python',
      "print('skip')",
      '```',
      '| a | b |',
      '|---|---|',
      '- See [the page](https://x.dev/a) and `C:/Projects/foo/bar.md`.',
      'Raw link https://example.com/x here.'
    ].join('\n')
    expect(replyTextForSpeech(md)).toBe(
      'Result\nShort answer: the loss drops fast , then flattens.\nSee the page and bar.md.\nRaw link here.'
    )
  })

  it('keeps short inline code and drops long inline code', () => {
    expect(replyTextForSpeech('Run `pnpm tc` now.')).toBe('Run pnpm tc now.')
    expect(replyTextForSpeech(`Run \`${'x'.repeat(60)}\` now.`)).toBe('Run now.')
  })
})

describe('speechChunks', () => {
  it('does not split file names on their dots and keeps Chinese sentences', () => {
    expect(speechChunks('Open bar.md first. 中文一句。中文两句？Last')).toEqual([
      'Open bar.md first. 中文一句。 中文两句？ Last'
    ])
  })

  it('starts with a short chunk and then groups larger ones', () => {
    const sentence = 'This sentence is about forty characters.'
    const chunks = speechChunks(Array(12).fill(sentence).join(' '))
    expect(chunks[0].length).toBeLessThanOrEqual(160)
    expect(chunks[1].length).toBeGreaterThan(160)
  })
})

describe('speechLanguageOf', () => {
  it('picks Chinese only when Chinese dominates', () => {
    expect(speechLanguageOf('The page shows 中文 a little.')).toBe('en')
    expect(speechLanguageOf('这是一个中文为主的句子，带一点 English。')).toBe('zh')
  })
})

describe('speechSegments', () => {
  it('gives Chinese runs to Chinese and keeps short English terms inside them', () => {
    expect(speechSegments('The layer we call 注意力机制 decides what matters.')).toEqual([
      { language: 'en', text: 'The layer we call' },
      { language: 'zh', text: '注意力机制' },
      { language: 'en', text: 'decides what matters.' }
    ])
    expect(speechSegments('这个 API 返回 JSON 数据。')).toEqual([
      { language: 'zh', text: '这个 API 返回 JSON 数据。' }
    ])
  })
})

describe('buildSpeechSsml', () => {
  it('escapes text, formats the rate and gives each segment its voice', () => {
    const ssml = buildSpeechSsml({
      segments: [
        { language: 'en', text: 'a < b & c' },
        { language: 'zh', text: '中文' }
      ],
      voices: { en: 'v-en', zh: 'v-zh' },
      ratePercent: 10
    })
    expect(ssml).toContain(
      "<voice name='v-en'><prosody rate='+10%'>a &lt; b &amp; c</prosody></voice>"
    )
    expect(ssml).toContain("<voice name='v-zh'><prosody rate='+10%'>中文</prosody></voice>")
  })
})
