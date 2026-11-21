import * as z from 'zod'
import { requiredString } from '../rpc-param-primitives'

// Desktop-only read-aloud params, kept out of speech-params.ts, which the phone page bundles for dictation.
export const SpeakRepliesConfigure = z
  .object({
    speakReplies: z.boolean().optional(),
    speakScope: z.enum(['focused', 'all']).optional(),
    speakVoice: z.string().trim().min(1).max(200).optional(),
    speakVoiceZh: z.string().trim().min(1).max(200).optional(),
    speakRate: z.number().int().min(-50).max(100).optional(),
    speakMixedVoices: z.boolean().optional(),
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
