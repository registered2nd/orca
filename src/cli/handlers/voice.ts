import type { CommandHandler } from '../dispatch'
import { getOptionalStringFlag, getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime/types'
import type { SpeakRepliesStatus, SpeakRepliesUpdate } from '../../shared/speech-types'
import type { RuntimeSpeechSetupState } from '../../shared/runtime-types'

function formatSpeakStatus(status: SpeakRepliesStatus): string {
  return [
    `Read replies aloud: ${status.speakReplies ? 'on' : 'off'} (${status.speakScope === 'all' ? 'every agent' : 'focused agent'})`,
    `Voice: ${status.speakVoice}`,
    `Chinese voice: ${status.speakVoiceZh}`,
    `Rate: ${status.speakRate >= 0 ? '+' : ''}${status.speakRate}%`,
    `Azure region: ${status.azureSpeechRegion || '(not set)'}`,
    `Azure key: ${status.azureSpeechKey === 'environment' ? 'from AZURE_SPEECH_KEY' : status.azureSpeechKey}`,
    `Dictation: ${status.dictationEnabled ? 'on' : 'off'}`
  ].join('\n')
}

function parseRate(value: string): number {
  const rate = Number(value.replace(/%$/, ''))
  if (!Number.isInteger(rate) || rate < -50 || rate > 100) {
    throw new RuntimeClientError(
      'invalid_argument',
      '--rate must be a whole number from -50 to 100'
    )
  }
  return rate
}

function parseScope(value: string): 'focused' | 'all' {
  if (value !== 'focused' && value !== 'all') {
    throw new RuntimeClientError('invalid_argument', '--scope must be focused or all')
  }
  return value
}

export const VOICE_HANDLERS: Record<string, CommandHandler> = {
  'voice status': async ({ client, json }) => {
    printResult(
      await client.call<SpeakRepliesStatus>('speech.speak.status'),
      json,
      formatSpeakStatus
    )
  },
  'voice speak on': async ({ client, json }) => {
    printResult(
      await client.call<SpeakRepliesStatus>('speech.speak.configure', {
        speakReplies: true
      }),
      json,
      formatSpeakStatus
    )
  },
  'voice speak off': async ({ client, json }) => {
    printResult(
      await client.call<SpeakRepliesStatus>('speech.speak.configure', {
        speakReplies: false
      }),
      json,
      formatSpeakStatus
    )
  },
  'voice set': async ({ client, flags, json }) => {
    const update: SpeakRepliesUpdate = {}
    const scope = getOptionalStringFlag(flags, 'scope')
    const voice = getOptionalStringFlag(flags, 'voice')
    const voiceZh = getOptionalStringFlag(flags, 'voice-zh')
    const rate = getOptionalStringFlag(flags, 'rate')
    const region = getOptionalStringFlag(flags, 'region')
    if (scope !== undefined) {
      update.speakScope = parseScope(scope)
    }
    if (voice !== undefined) {
      update.speakVoice = voice
    }
    if (voiceZh !== undefined) {
      update.speakVoiceZh = voiceZh
    }
    if (rate !== undefined) {
      update.speakRate = parseRate(rate)
    }
    if (region !== undefined) {
      update.azureSpeechRegion = region
    }
    if (Object.keys(update).length === 0) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Nothing to set: pass --scope, --voice, --voice-zh, --rate or --region'
      )
    }
    printResult(
      await client.call<SpeakRepliesStatus>('speech.speak.configure', update),
      json,
      formatSpeakStatus
    )
  },
  'voice stop': async ({ client, json }) => {
    printResult(await client.call<{ stopped: true }>('speech.speak.stop'), json, () => 'Stopped.')
  },
  'voice say': async ({ client, flags, json }) => {
    const text = getRequiredStringFlag(flags, 'text')
    printResult(
      await client.call<{ queued: true }>('speech.speak.say', { text }),
      json,
      () => 'Speaking.'
    )
  },
  'voice azure-key set': async ({ client, flags, json }) => {
    const fromEnv = flags.get('from-env') === true
    const key = fromEnv ? process.env.AZURE_SPEECH_KEY?.trim() : getRequiredStringFlag(flags, 'key')
    if (!key) {
      throw new RuntimeClientError('invalid_argument', 'AZURE_SPEECH_KEY is not set in this shell')
    }
    const region =
      getOptionalStringFlag(flags, 'region') ??
      (fromEnv ? process.env.AZURE_SPEECH_REGION?.trim() || undefined : undefined)
    printResult(
      await client.call<SpeakRepliesStatus>('speech.speak.credentials', {
        key,
        region
      }),
      json,
      formatSpeakStatus
    )
  },
  'voice azure-key clear': async ({ client, json }) => {
    printResult(
      await client.call<SpeakRepliesStatus>('speech.speak.credentials', {
        key: null
      }),
      json,
      formatSpeakStatus
    )
  },
  'voice dictation on': async ({ client, json }) => {
    printResult(
      await client.call<RuntimeSpeechSetupState>('speech.dictation.setup', {
        enabled: true
      }),
      json,
      (state) =>
        state.selectedModelId
          ? `Dictation on (model ${state.selectedModelId}).`
          : 'Dictation on, but no speech model is selected yet.'
    )
  },
  'voice dictation off': async ({ client, json }) => {
    printResult(
      await client.call<RuntimeSpeechSetupState>('speech.dictation.setup', {
        enabled: false
      }),
      json,
      () => 'Dictation off.'
    )
  }
}
