import type { DictationTerm } from './dictation-dictionary'
export type SpeechModelType =
  | 'transducer'
  | 'paraformer'
  | 'whisper'
  | 'senseVoice'
  | 'nemo-ctc'
  | 'openai'
  | 'vtypes'
export type SpeechModelProvider = 'local' | 'openai' | 'openai-compatible' | 'vtypes'

export type SpeechModelDownloadFile = {
  name: string
  url: string
  sizeBytes: number
  sha256: string
}

/** One measured error rate: word error rate, or character error rate for Chinese, Japanese and Korean. */
export type SpeechModelErrorRate = {
  language: string
  percent: number
  metric: 'wer' | 'cer'
  test: 'librispeech' | 'fleurs'
  clips: number
  /** YYYY-MM-DD of the benchmark run. */
  measuredOn: string
}

export type SpeechModelManifest = {
  id: string
  label: string
  type: SpeechModelType
  provider: SpeechModelProvider
  /** The text pipeline's hint: one language, a bilingual pair such as 'zh-en', or 'multilingual'. */
  language: string
  /** Every language the model transcribes (ISO-639-1, plus 'yue' for Cantonese). */
  languages: readonly string[]
  /** Measured error rates; a supported language missing here has not been measured. */
  errorRates?: readonly SpeechModelErrorRate[]
  /** Licence of the downloaded weights; absent for cloud models. */
  licence?: string
  sizeBytes?: number
  downloadFiles?: SpeechModelDownloadFile[]
  files?: string[]
  /** The sherpa-onnx files an earlier Orca downloaded for this model; they no longer run. */
  legacyDownloadFiles?: SpeechModelDownloadFile[]
  sampleRate: number
  streaming: boolean
  recommended?: boolean
  /** Languages one-click setup offers this model for, ahead of the recommended default. */
  suggestedFor?: readonly string[]
  /** Retired: never offered for selection, and a saved selection moves to this model on load. */
  replacedBy?: string
  /** Codes the engine accepts (others crash or fail to load it); absent when it ignores the setting. */
  dictationLanguages?: readonly string[]
}

export type OpenAiCompatibleSpeechProvider = {
  baseUrl: string
  model: string
  /** Empty for servers that take no key. */
  apiKey: string
}

export type OpenAiCompatibleSpeechProviderSummary = Omit<
  OpenAiCompatibleSpeechProvider,
  'apiKey'
> & {
  hasApiKey: boolean
}

export type SpeechModelStatus = 'not-downloaded' | 'downloading' | 'extracting' | 'ready' | 'error'

export type SpeechModelState = {
  id: string
  status: SpeechModelStatus
  progress?: number
  error?: string
  /** Only the legacy sherpa-onnx files are on disk: downloading replaces them with the current ones. */
  needsUpdate?: true
}

export type SpeechTranscriptEvent = {
  text: string
  sessionId: string
}

/** Speech the engine has heard but not committed yet; only pause-cut on-device models send it. */
export type SpeechPendingEvent = {
  pending: boolean
  sessionId: string
}

/** Desktop audio posted from the preload straight to the speech process; 'end' follows the last frame. */
export type SpeechAudioPortMessage =
  | { type: 'feed'; samples: Float32Array; sampleRate: number }
  | { type: 'end' }

export type SpeechLifecycleEvent = {
  sessionId: string
}

export type SpeechErrorEvent = {
  error: string
  sessionId: string
}

export type DictationState = 'idle' | 'starting' | 'listening' | 'stopping' | 'error'

// See dictation-shortcut-mode.ts for Auto.
export type DictationMode = 'toggle' | 'hold'

export type SpeechGpuMode = 'auto' | 'off'

export type VoiceSettings = {
  enabled: boolean
  sttModel: string
  modelsDir: string
  /** 'auto' or an ISO-639-1 code. Not `language`: its stored 'en' default never came from the user. */
  dictationLanguage: string
  dictationMode: DictationMode
  dictationHoldToRecord: boolean
  /** Drops "um", "uh" and their equivalents in the dictation language before text is inserted. */
  removeFillerWords: boolean
  terminalConfirmBeforeInsert: boolean
  openAiApiKeyConfigured: boolean
  /** null = system default input device */
  microphoneDeviceId: string | null
  /** Cached label for display when the preferred device is unplugged */
  microphoneDeviceLabel: string | null
  /** Minutes an idle on-device model stays loaded; 0 unloads after each dictation, null never unloads. */
  unloadModelAfterMinutes: number | null
  /** 'off' keeps on-device recognition on the CPU, for machines whose GPU driver hard-crashes. Absent = 'auto'. */
  speechGpu?: SpeechGpuMode
  /** Personal dictionary, used in every repo; each repo adds its own Repo.dictationTerms. */
  dictationTerms?: DictationTerm[]
  /** Adds the current repo's name as a hint (DictationTerm.hint). Absent = on. */
  dictationRepoNameHint?: boolean
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

/** Where a dictation goes: an engine in the desktop's own process takes repoTerms, a host resolves worktreeId itself. */
export type DictationContext = {
  worktreeId?: string
  repoTerms?: DictationTerm[]
  repoName?: string
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
  /** The latest failed Azure synthesis since the app started; that chunk used the system voice. */
  lastAzureFailure: { at: string; message: string } | null
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
