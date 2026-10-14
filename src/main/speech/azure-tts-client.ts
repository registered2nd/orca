import type { SpeakSynthesisResult, VoiceSettings } from '../../shared/speech-types'
import { buildSpeechSsml, speechLanguageOf, speechSegments } from '../../shared/speech-reply-text'
import { readAzureSpeechKey } from './azure-speech-key-store'

const SYNTHESIS_TIMEOUT_MS = 20_000
const OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3'

export function resolveAzureSpeechRegion(voice: Pick<VoiceSettings, 'azureSpeechRegion'>): string {
  return voice.azureSpeechRegion.trim() || process.env.AZURE_SPEECH_REGION?.trim() || ''
}

/** One chunk of text to MP3 through Azure's REST endpoint; no SDK, no native module. */
export async function synthesizeWithAzure(
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
    return { ok: false, reason: 'failed', message: String(error) }
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
    return { ok: false, reason: 'failed', message: String(error) }
  }
}
