import { BrowserWindow } from 'electron'
import { getDefaultVoiceSettings } from '../../shared/constants'
import type {
  SpeakControlEvent,
  SpeakRepliesStatus,
  SpeakRepliesUpdate,
  VoiceSettings
} from '../../shared/speech-types'
import type { Store } from '../persistence'
import {
  clearAzureSpeechKey,
  hasStoredAzureSpeechKey,
  saveAzureSpeechKey
} from './azure-speech-key-store'
import { getLastAzureSpeechFailure, resolveAzureSpeechRegion } from './azure-tts-client'

export const SPEAK_CONTROL_CHANNEL = 'speech:speakControl'

// Why: the RPC surface (CLI) and IPC share one owner without threading it through the runtime class.
let speakStore: Store | null = null

export function setSpeakRepliesStore(store: Store): void {
  speakStore = store
}

function requireStore(): Store {
  if (!speakStore) {
    throw new Error('speak_replies_unavailable')
  }
  return speakStore
}

function currentVoice(store: Store): VoiceSettings {
  return { ...getDefaultVoiceSettings(), ...store.getSettings().voice }
}

export function getSpeakRepliesStatus(): SpeakRepliesStatus {
  const voice = currentVoice(requireStore())
  return {
    speakReplies: voice.speakReplies,
    speakScope: voice.speakScope,
    speakVoice: voice.speakVoice,
    speakVoiceZh: voice.speakVoiceZh,
    speakRate: voice.speakRate,
    speakMixedVoices: voice.speakMixedVoices,
    azureSpeechRegion: resolveAzureSpeechRegion(voice),
    azureSpeechKey: hasStoredAzureSpeechKey()
      ? 'stored'
      : process.env.AZURE_SPEECH_KEY?.trim()
        ? 'environment'
        : 'missing',
    lastAzureFailure: getLastAzureSpeechFailure(),
    dictationEnabled: voice.enabled
  }
}

export function updateSpeakReplies(update: SpeakRepliesUpdate): SpeakRepliesStatus {
  const store = requireStore()
  store.updateSettings({ voice: { ...currentVoice(store), ...update } }, { notifyListeners: true })
  if (update.speakReplies === false) {
    sendSpeakControl({ action: 'stop' })
  }
  return getSpeakRepliesStatus()
}

export function setAzureSpeechCredentials(key: string | null, region?: string): SpeakRepliesStatus {
  if (key === null) {
    clearAzureSpeechKey()
  } else {
    saveAzureSpeechKey(key)
  }
  const store = requireStore()
  store.updateSettings(
    {
      voice: {
        ...currentVoice(store),
        ...(region !== undefined ? { azureSpeechRegion: region.trim() } : {}),
        azureSpeechKeyConfigured: key !== null
      }
    },
    { notifyListeners: true }
  )
  return getSpeakRepliesStatus()
}

export function toggleSpeakReplies(): void {
  if (speakStore) {
    updateSpeakReplies({
      speakReplies: !currentVoice(speakStore).speakReplies
    })
  }
}

export function sendSpeakControl(event: SpeakControlEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(SPEAK_CONTROL_CHANNEL, event)
    }
  }
}
