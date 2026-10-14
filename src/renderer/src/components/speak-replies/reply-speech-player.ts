import {
  replyTextForSpeech,
  speechChunks,
  speechLanguageOf
} from '../../../../shared/speech-reply-text'
import type { SpeakSynthesisResult } from '../../../../shared/speech-types'

export type ReplySpeechState = { speaking: boolean; paneKey: string | null }

let state: ReplySpeechState = { speaking: false, paneKey: null }
const listeners = new Set<() => void>()
let generation = 0
let currentAudio: HTMLAudioElement | null = null
let warnedFallback = false

function setState(next: ReplySpeechState): void {
  state = next
  for (const listener of listeners) {
    listener()
  }
}

export function subscribeReplySpeech(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getReplySpeechState(): ReplySpeechState {
  return state
}

export function stopReplySpeech(): void {
  generation += 1
  currentAudio?.pause()
  currentAudio = null
  window.speechSynthesis?.cancel()
  if (state.speaking) {
    setState({ speaking: false, paneKey: null })
  }
}

function playAudio(audio: Uint8Array, mimeType: string, gen: number): Promise<void> {
  return new Promise((resolve) => {
    if (gen !== generation) {
      resolve()
      return
    }
    const url = URL.createObjectURL(new Blob([new Uint8Array(audio)], { type: mimeType }))
    const element = new Audio(url)
    currentAudio = element
    const done = (): void => {
      URL.revokeObjectURL(url)
      element.removeEventListener('ended', done)
      element.removeEventListener('error', done)
      element.removeEventListener('pause', done)
      resolve()
    }
    element.addEventListener('ended', done)
    element.addEventListener('error', done)
    // Why: stopReplySpeech pauses; without this the playback loop would wait forever.
    element.addEventListener('pause', done)
    void element.play().catch(done)
  })
}

// Without an Azure key (or offline) the OS voice still reads the reply.
function speakWithSystemVoice(text: string, gen: number): Promise<void> {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis
    if (!synth || gen !== generation) {
      resolve()
      return
    }
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = speechLanguageOf(text) === 'zh' ? 'zh-CN' : 'en-US'
    utterance.onend = () => resolve()
    utterance.onerror = () => resolve()
    synth.speak(utterance)
  })
}

/** Reads `markdown` aloud, replacing whatever is playing. */
export async function speakReply(markdown: string, paneKey: string | null): Promise<void> {
  stopReplySpeech()
  const chunks = speechChunks(replyTextForSpeech(markdown))
  if (chunks.length === 0) {
    return
  }
  const gen = generation
  setState({ speaking: true, paneKey })
  const synthesize = (chunk: string): Promise<SpeakSynthesisResult> =>
    window.api.speech
      .synthesizeReply(chunk)
      .catch((error: unknown) => ({ ok: false, reason: 'failed', message: String(error) }) as const)
  try {
    let next = synthesize(chunks[0])
    for (let i = 0; i < chunks.length && gen === generation; i += 1) {
      const result = await next
      // Prefetch the following chunk while this one plays.
      if (i + 1 < chunks.length) {
        next = synthesize(chunks[i + 1])
      }
      if (gen !== generation) {
        break
      }
      if (result.ok) {
        await playAudio(result.audio, result.mimeType, gen)
      } else {
        if (!warnedFallback) {
          warnedFallback = true
          console.warn('[speak-replies] Azure voice unavailable, using system voice:', result)
        }
        await speakWithSystemVoice(chunks[i], gen)
      }
    }
  } finally {
    if (gen === generation) {
      currentAudio = null
      setState({ speaking: false, paneKey: null })
    }
  }
}
