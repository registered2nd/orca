import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { combineChunks, encodePcm16Wav } from './openai-transcription-client'
import { resampleToRate } from './stt-audio-resample'

const SAMPLE_RATE = 16000
// Why: Vtypes's agent API takes bodies up to 32 MiB; ten minutes of base64 PCM16 is ~26 MiB.
const MAX_AUDIO_SECONDS = 10 * 60
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
  private audioSeconds = 0

  constructor(private readonly endpointFilePath: () => string = getVtypesAgentApiFilePath) {}

  feedAudio(samples: Float32Array, sampleRate: number): void {
    const normalized = resampleToRate(samples, sampleRate, SAMPLE_RATE)
    this.audioSeconds += normalized.length / SAMPLE_RATE
    if (this.audioSeconds > MAX_AUDIO_SECONDS) {
      throw new Error('Vtypes dictation is limited to 10 minutes')
    }
    this.chunks.push(new Float32Array(normalized))
  }

  async finish(): Promise<string> {
    if (this.chunks.length === 0) {
      return ''
    }
    const wav = encodePcm16Wav(combineChunks(this.chunks), SAMPLE_RATE)
    this.chunks = []
    // Why: Vtypes picks a new port and token at each launch, so read them per dictation.
    const { port, token } = readEndpoint(this.endpointFilePath())

    let response: Response
    try {
      response = await fetch(`http://127.0.0.1:${port}/v1/dictate`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ audio: wav.toString('base64'), app: APP_NAME }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      })
    } catch (error) {
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
