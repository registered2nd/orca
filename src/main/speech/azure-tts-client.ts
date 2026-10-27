import type { SpeakSynthesisResult, VoiceSettings } from '../../shared/speech-types'
import { buildSpeechSsml, speechLanguageOf, speechSegments } from '../../shared/speech-reply-text'
import { startSpan } from '../observability/tracer'
import { readAzureSpeechKey } from './azure-speech-key-store'

const SYNTHESIS_TIMEOUT_MS = 20_000
const OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3'

export type AzureSpeechFailure = { at: string; message: string }

let lastFailure: AzureSpeechFailure | null = null

/** The most recent failed synthesis since the app started, for `orca voice status`. */
export function getLastAzureSpeechFailure(): AzureSpeechFailure | null {
  return lastFailure
}

// Why: Node's fetch throws "TypeError: fetch failed" and keeps the real reason (connect timeout,
// reset, DNS) on `cause`; without it the log cannot tell a network block from a bad key.
function describeError(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error)
  }
  if (error.name === 'TimeoutError') {
    return `no response within ${SYNTHESIS_TIMEOUT_MS / 1000} s`
  }
  const cause = error.cause as { code?: string; message?: string } | undefined
  const detail = [cause?.code, cause?.message].filter(Boolean).join(' ')
  return `${error.name}: ${error.message}${detail ? ` (${detail})` : ''}`
}

export function resolveAzureSpeechRegion(voice: Pick<VoiceSettings, 'azureSpeechRegion'>): string {
  return voice.azureSpeechRegion.trim() || process.env.AZURE_SPEECH_REGION?.trim() || ''
}

/**
 * One chunk of text to MP3 through Azure's REST endpoint; no SDK, no native module.
 * Failures go to the main trace log as `speech.azure-tts` spans, since the renderer then reads
 * the chunk with the system voice and leaves no other record.
 */
export async function synthesizeWithAzure(
  text: string,
  voice: Pick<
    VoiceSettings,
    'azureSpeechRegion' | 'speakVoice' | 'speakVoiceZh' | 'speakRate' | 'speakMixedVoices'
  >
): Promise<SpeakSynthesisResult> {
  const span = startSpan('speech.azure-tts', {
    attributes: {
      region: resolveAzureSpeechRegion(voice),
      voice: voice.speakVoice,
      chars: text.length
    },
    shouldRecord: (record) => record.exit._tag !== 'Success'
  })
  const result = await requestAzureSpeech(text, voice)
  if (result.ok) {
    span.end()
    return result
  }
  const message = result.message ?? result.reason
  lastFailure = { at: new Date().toISOString(), message }
  span.setAttribute('reason', result.reason)
  span.fail(message)
  return result
}

async function requestAzureSpeech(
  text: string,
  voice: Pick<
    VoiceSettings,
    'azureSpeechRegion' | 'speakVoice' | 'speakVoiceZh' | 'speakRate' | 'speakMixedVoices'
  >
): Promise<SpeakSynthesisResult> {
  let key: string | null
  try {
    key = readAzureSpeechKey()
  } catch (error) {
    return { ok: false, reason: 'failed', message: describeError(error) }
  }
  if (!key) {
    return { ok: false, reason: 'no-key' }
  }
  const region = resolveAzureSpeechRegion(voice)
  if (!region) {
    return { ok: false, reason: 'no-region' }
  }
  const ssml = buildSpeechSsml({
    segments: voice.speakMixedVoices
      ? speechSegments(text)
      : [{ language: speechLanguageOf(text), text }],
    voices: { en: voice.speakVoice, zh: voice.speakVoiceZh },
    ratePercent: voice.speakRate
  })
  try {
    const response = await fetch(
      `https://${encodeURIComponent(region)}.tts.speech.microsoft.com/cognitiveservices/v1`,
      {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': OUTPUT_FORMAT,
          'User-Agent': 'orca'
        },
        body: ssml,
        signal: AbortSignal.timeout(SYNTHESIS_TIMEOUT_MS)
      }
    )
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 200)
      return {
        ok: false,
        reason: 'failed',
        message: `Azure ${response.status} ${detail}`.trim()
      }
    }
    return {
      ok: true,
      audio: new Uint8Array(await response.arrayBuffer()),
      mimeType: 'audio/mpeg'
    }
  } catch (error) {
    return { ok: false, reason: 'failed', message: describeError(error) }
  }
}
