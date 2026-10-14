import { z } from 'zod'
import { OptionalString, requiredString } from './rpc-param-primitives'

export const AUDIO_BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/

export const DICTATION_SAMPLE_RATE = 16_000

export const PCM_BYTES_PER_SAMPLE = 2

export const MAX_DICTATION_AUDIO_SECONDS = 5

export const MAX_DICTATION_AUDIO_CHUNK_BYTES =
  DICTATION_SAMPLE_RATE * PCM_BYTES_PER_SAMPLE * MAX_DICTATION_AUDIO_SECONDS

export const MAX_DICTATION_AUDIO_CHUNK_BASE64_LENGTH =
  Math.ceil(MAX_DICTATION_AUDIO_CHUNK_BYTES / 3) * 4

export function isValidAudioBase64(value: string): boolean {
  return value.length % 4 !== 1 && AUDIO_BASE64_PATTERN.test(value)
}

export const DictationStart = z.object({
  dictationId: requiredString('Missing dictation ID'),
  modelId: OptionalString
})

export const DictationChunk = z.object({
  dictationId: requiredString('Missing dictation ID'),
  audioBase64: requiredString('Missing audio chunk')
    // Bound before Buffer/Float32Array allocation, matching the mobile pending-audio budget.
    .refine(
      (value) => value.length <= MAX_DICTATION_AUDIO_CHUNK_BASE64_LENGTH,
      'Audio chunk is too large'
    )
    // Buffer.from silently discards malformed base64; refuse corrupt PCM instead.
    .refine(isValidAudioBase64, 'Audio chunk must be base64'),
  sampleRate: z.number().finite().positive()
})

export const DictationHandle = z.object({
  dictationId: requiredString('Missing dictation ID')
})

export const SpeechModelAction = z.object({
  modelId: requiredString('Missing model ID')
})

export const DictationSetup = z.object({
  enabled: z.boolean().optional(),
  modelId: OptionalString,
  dictationMode: z.enum(['toggle', 'hold']).optional()
})

/** Why the cap: an OpenAI key is ~200 characters; anything far longer is a paste mistake. */
export const OPENAI_SPEECH_KEY_MAX_LENGTH = 1024

export const OpenAiSpeechKeySet = z.object({
  apiKey: z.string().trim().min(1).max(OPENAI_SPEECH_KEY_MAX_LENGTH)
})

export const SpeakRepliesConfigure = z
  .object({
    speakReplies: z.boolean().optional(),
    speakScope: z.enum(['focused', 'all']).optional(),
    speakVoice: z.string().trim().min(1).max(200).optional(),
    speakVoiceZh: z.string().trim().min(1).max(200).optional(),
    speakRate: z.number().int().min(-50).max(100).optional(),
    azureSpeechRegion: z.string().trim().max(64).optional()
  })
  .strict()

export const SpeakAzureCredentials = z
  .object({
    key: z.string().trim().min(1).max(512).nullable(),
    region: z.string().trim().max(64).optional()
  })
  .strict()

export const SpeakSay = z.object({
  text: requiredString('Missing text').refine((value) => value.length <= 8000, 'Text is too long')
})
