import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { encodePcm16Wav } from './openai-transcription-client'
import { resampleToRate } from './stt-audio-resample'

const SAMPLE_RATE = 16000
// Why: Vtypes's agent API takes bodies up to 32 MiB; ten minutes of base64 PCM16 is ~26 MiB.
const MAX_AUDIO_SAMPLES = 10 * 60 * SAMPLE_RATE
// Why: Vtypes waits up to 180 s for its own pipeline before answering 504.
const REQUEST_TIMEOUT_MS = 190_000
// Why: Vtypes app rules are keyed by app name, so a rule for "Orca" styles these dictations.
const APP_NAME = 'Orca'
const NOT_RUNNING = "Vtypes isn't running. Start the Vtypes app and dictate again."

type AgentApiEndpoint = {
  port: number
  token: string
}

/** Where the Vtypes desktop app writes its agent-api.json, per OS. */
export function getVtypesAgentApiFilePath(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir()
): string {
  const configRoot =
    platform === 'win32'
      ? (env.APPDATA ?? join(home, 'AppData', 'Roaming'))
      : platform === 'darwin'
        ? join(home, 'Library', 'Application Support')
        : (env.XDG_CONFIG_HOME ?? join(home, '.config'))
  return join(configRoot, 'com.vtype.desktop', 'agent-api.json')
}

export function hasVtypesAgentApiFile(): boolean {
  return existsSync(getVtypesAgentApiFilePath())
}

function readEndpoint(filePath: string): AgentApiEndpoint {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(filePath, 'utf8'))
  } catch {
    throw new Error(NOT_RUNNING)
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('port' in parsed) ||
    !('token' in parsed)
  ) {
    throw new Error(NOT_RUNNING)
  }
  const { port, token } = parsed
  if (typeof port !== 'number' || typeof token !== 'string') {
    throw new Error(NOT_RUNNING)
  }
  return { port, token }
}

export class VtypesAppSession {
  private chunks: Float32Array[] = []
  private audioSamples = 0
  private readonly abortController = new AbortController()

  constructor(private readonly endpointFilePath: () => string = getVtypesAgentApiFilePath) {}

  cancel(): void {
    this.chunks = []
    this.audioSamples = 0
    this.abortController.abort()
  }

  /** Keeps audio up to the 10-minute cap; returns true on the chunk that reaches it. */
  feedAudio(samples: Float32Array, sampleRate: number): boolean {
    const room = MAX_AUDIO_SAMPLES - this.audioSamples
    if (this.abortController.signal.aborted || room <= 0) {
      return false
    }
    const kept = resampleToRate(samples, sampleRate, SAMPLE_RATE).slice(0, room)
    this.audioSamples += kept.length
    this.chunks.push(kept)
    return this.audioSamples === MAX_AUDIO_SAMPLES
  }

  async finish(): Promise<string> {
    if (this.chunks.length === 0) {
      return ''
    }
    const wav = encodePcm16Wav(this.chunks, SAMPLE_RATE)
    this.chunks = []
    // Why: Vtypes picks a new port and token at each launch, so read them per dictation.
    const { port, token } = readEndpoint(this.endpointFilePath())

    let response: Response
    try {
      response = await fetch(`http://127.0.0.1:${port}/v1/dictate`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ audio: wav.toString('base64'), app: APP_NAME }),
        signal: AbortSignal.any([
          this.abortController.signal,
          AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        ])
      })
    } catch (error) {
      if (this.abortController.signal.aborted) {
        throw error
      }
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new Error('Vtypes did not answer in time')
      }
      // Why: a refused connection means the file is left over from a Vtypes that has exited.
      throw new Error(NOT_RUNNING)
    }

    const data: unknown = await response.json().catch(() => ({}))
    const body = typeof data === 'object' && data !== null ? { ...data } : {}
    if (response.status === 401) {
      throw new Error(NOT_RUNNING)
    }
    if (!response.ok) {
      const message = 'error' in body && typeof body.error === 'string' ? body.error : null
      throw new Error(`Vtypes could not dictate: ${message ?? `HTTP ${response.status}`}`)
    }
    if (!('text' in body) || typeof body.text !== 'string') {
      throw new Error('Vtypes returned no text')
    }
    return body.text.trim()
  }
}
