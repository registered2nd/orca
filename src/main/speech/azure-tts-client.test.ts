import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetTracerForTests, setActiveSink } from '../observability/tracer'
import { getLastAzureSpeechFailure, synthesizeWithAzure } from './azure-tts-client'

vi.mock('./azure-speech-key-store', () => ({ readAzureSpeechKey: () => 'test-key' }))

const voice = {
  azureSpeechRegion: 'eastus2',
  speakVoice: 'en-US-Ava:DragonHDOmniLatestNeural',
  speakVoiceZh: 'zh-CN-Mei:MAI-Voice-2.1',
  speakRate: 10,
  speakMixedVoices: false
}

type Span = {
  name: string
  attributes: Record<string, unknown>
  exit: { _tag: string; cause?: string }
}

let records: Span[]

beforeEach(() => {
  records = []
  setActiveSink({ push: (r) => records.push(r as Span), flush() {}, close() {} })
})

afterEach(() => {
  _resetTracerForTests()
  vi.unstubAllGlobals()
})

describe('synthesizeWithAzure', () => {
  it('keeps the network cause of a failed fetch and traces it', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('fetch failed', {
        cause: Object.assign(new Error('Connect Timeout Error'), {
          code: 'UND_ERR_CONNECT_TIMEOUT'
        })
      })
    })

    const result = await synthesizeWithAzure('Hello there.', voice)

    expect(result).toEqual({
      ok: false,
      reason: 'failed',
      message: 'TypeError: fetch failed (UND_ERR_CONNECT_TIMEOUT Connect Timeout Error)'
    })
    expect(getLastAzureSpeechFailure()?.message).toBe(
      'TypeError: fetch failed (UND_ERR_CONNECT_TIMEOUT Connect Timeout Error)'
    )
    expect(records).toHaveLength(1)
    expect(records[0].name).toBe('speech.azure-tts')
    expect(records[0].attributes).toMatchObject({ region: 'eastus2', reason: 'failed', chars: 12 })
    expect(records[0].exit).toEqual({
      _tag: 'Failure',
      cause: 'TypeError: fetch failed (UND_ERR_CONNECT_TIMEOUT Connect Timeout Error)'
    })
  })

  it('names a timeout and an HTTP error plainly', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
    })
    expect(await synthesizeWithAzure('Hi.', voice)).toMatchObject({
      message: 'no response within 20 s'
    })

    vi.stubGlobal('fetch', async () => new Response('Quota exceeded', { status: 429 }))
    expect(await synthesizeWithAzure('Hi.', voice)).toMatchObject({
      message: 'Azure 429 Quota exceeded'
    })
    expect(records.map((r) => r.exit.cause)).toEqual([
      'no response within 20 s',
      'Azure 429 Quota exceeded'
    ])
  })

  it('records nothing when Azure returns audio', async () => {
    vi.stubGlobal('fetch', async () => new Response(new Uint8Array([1, 2, 3])))

    const result = await synthesizeWithAzure('Hi.', voice)

    expect(result).toMatchObject({ ok: true, mimeType: 'audio/mpeg' })
    expect(records).toHaveLength(0)
  })
})
