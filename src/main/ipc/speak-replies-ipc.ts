import { ipcMain } from 'electron'
import type { Store } from '../persistence/loading-store/store'
import type { SpeakRepliesUpdate } from '../../shared/speech-types'
import { getDefaultVoiceSettings } from '../../shared/constants'
import { synthesizeWithAzure } from '../speech/azure-tts-client'
import {
  getSpeakRepliesStatus,
  setAzureSpeechCredentials,
  setSpeakRepliesStore,
  updateSpeakReplies
} from '../speech/speak-replies-service'

// Fork-only: read-aloud of finished agent replies, registered from speech.ts.
export function registerSpeakRepliesHandlers(store: Store): void {
  setSpeakRepliesStore(store)

  ipcMain.handle('speech:synthesizeReply', async (_event, text: string) =>
    synthesizeWithAzure(String(text), {
      ...getDefaultVoiceSettings(),
      ...store.getSettings().voice
    })
  )

  ipcMain.handle('speech:getSpeakRepliesStatus', () => getSpeakRepliesStatus())

  ipcMain.handle('speech:updateSpeakReplies', (_event, update: SpeakRepliesUpdate) =>
    updateSpeakReplies(update)
  )

  ipcMain.handle(
    'speech:setAzureSpeechCredentials',
    (_event, key: string | null, region?: string) => setAzureSpeechCredentials(key, region)
  )
}
