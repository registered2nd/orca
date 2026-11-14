import type { SettingsSearchEntry } from '../search/settings-search'
import { translate } from '@/i18n/i18n'
import { translateSearchKeyword } from '../search/settings-search-keywords'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'

// Fork-only: the read-aloud card's search entry, listed by voice-pane-search.ts.
export const getVoiceReadAloudSearchEntry = createLocalizedCatalog((): SettingsSearchEntry => ({
  title: translate(
    'auto.components.settings.voice.pane.search.readAloudTitle',
    'Read Replies Aloud'
  ),
  description: translate(
    'auto.components.settings.voice.pane.search.readAloudDescription',
    'Speak finished agent replies with an Azure or system voice.'
  ),
  keywords: [
    ...translateSearchKeyword('auto.components.settings.voice.pane.search.7640ed9848', 'voice'),
    ...translateSearchKeyword('auto.components.settings.voice.pane.search.3d8b853963', 'speech'),
    ...translateSearchKeyword('auto.components.settings.voice.pane.search.readAloudTts', 'tts'),
    ...translateSearchKeyword(
      'auto.components.settings.voice.pane.search.readAloudSpeak',
      'read aloud'
    ),
    ...translateSearchKeyword('auto.components.settings.voice.pane.search.readAloudAzure', 'azure')
  ]
}))
