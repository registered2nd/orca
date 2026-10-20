export type SpeechModelType =
  | 'transducer'
  | 'paraformer'
  | 'whisper'
  | 'senseVoice'
  | 'nemo-ctc'
  | 'openai'
  | 'vtypes'
export type SpeechModelProvider = 'local' | 'openai' | 'vtypes'

export type ModelingUnit = 'bpe' | 'cjkchar' | 'cjkchar+bpe'

export type SpeechModelDownloadFile = {
  name: string
  url: string
  sizeBytes: number
  sha256: string
}

export type SpeechModelManifest = {
  id: string
  label: string
  description: string
  type: SpeechModelType
  provider: SpeechModelProvider
  language: string
  sizeBytes?: number
  downloadFiles?: SpeechModelDownloadFile[]
  files?: string[]
  sampleRate: number
  streaming: boolean
  modelingUnit?: ModelingUnit
  recommended?: boolean
}

export type SpeechModelStatus = 'not-downloaded' | 'downloading' | 'extracting' | 'ready' | 'error'

export type SpeechModelState = {
  id: string
  status: SpeechModelStatus
  progress?: number
  error?: string
}

export type SpeechTranscriptEvent = {
  text: string
  sessionId: string
}

export type SpeechLifecycleEvent = {
  sessionId: string
}

export type SpeechErrorEvent = {
  error: string
  sessionId: string
}

export type DictationState = 'idle' | 'starting' | 'listening' | 'stopping' | 'error'

export type UserModelConfig = {
  id: string
  type: SpeechModelType
  dir: string
  sampleRate?: number
}

export type DictationMode = 'toggle' | 'hold'

export type VoiceSettings = {
  enabled: boolean
  sttModel: string
  modelsDir: string
  language: string
  dictationMode: DictationMode
  terminalConfirmBeforeInsert: boolean
  userModels: UserModelConfig[]
  openAiApiKeyConfigured: boolean
  /** null = system default input device */
  microphoneDeviceId: string | null
  /** Cached label for display when the preferred device is unplugged */
  microphoneDeviceLabel: string | null
  /** Read finished agent replies aloud. */
  speakReplies: boolean
  /** Which agents speak: the last-focused agent pane, or every agent. */
  speakScope: SpeakRepliesScope
  /** Azure voice for English (and mixed) replies, e.g. en-US-Ava:DragonHDLatestNeural. */
  speakVoice: string
  /** Azure voice for mostly-Chinese replies. */
  speakVoiceZh: string
  /** Speaking-rate change in percent; 0 is the voice's normal speed. */
  speakRate: number
  /** Experimental: switch voice inside a reply between its English and Chinese stretches. */
  speakMixedVoices: boolean
  /** Azure Speech region (e.g. eastus2); empty falls back to AZURE_SPEECH_REGION. */
  azureSpeechRegion: string
  azureSpeechKeyConfigured: boolean
}

export type SpeakRepliesScope = 'focused' | 'all'

export type SpeakControlEvent = { action: 'stop' } | { action: 'say'; text: string }

export type SpeakSynthesisResult =
  | { ok: true; audio: Uint8Array; mimeType: string }
  | { ok: false; reason: 'no-key' | 'no-region' | 'failed'; message?: string }

export type SpeakRepliesStatus = {
  speakReplies: boolean
  speakScope: SpeakRepliesScope
  speakVoice: string
  speakVoiceZh: string
  speakRate: number
  speakMixedVoices: boolean
  /** The region synthesis uses: the setting, else AZURE_SPEECH_REGION. */
  azureSpeechRegion: string
  azureSpeechKey: 'stored' | 'environment' | 'missing'
  dictationEnabled: boolean
}

export type SpeakRepliesUpdate = Partial<
  Pick<
    VoiceSettings,
    | 'speakReplies'
    | 'speakScope'
    | 'speakVoice'
    | 'speakVoiceZh'
    | 'speakRate'
    | 'speakMixedVoices'
    | 'azureSpeechRegion'
  >
>
