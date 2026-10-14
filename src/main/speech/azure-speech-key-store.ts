import { getSecretStore } from '../../shared/secret-store'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const AZURE_SPEECH_TOKEN_FILE = 'azure-speech-token.enc'
let cachedAzureSpeechKey: string | null = null

function getAzureKeyPath(): string {
  return join(homedir(), '.orca', AZURE_SPEECH_TOKEN_FILE)
}

export function hasStoredAzureSpeechKey(): boolean {
  return existsSync(getAzureKeyPath())
}

export function saveAzureSpeechKey(key: string): void {
  const trimmed = key.trim()
  if (!trimmed) {
    throw new Error('Azure Speech key is required')
  }
  mkdirSync(join(homedir(), '.orca'), { recursive: true })
  if (getSecretStore().isEncryptionAvailable()) {
    writeFileSync(getAzureKeyPath(), getSecretStore().encryptString(trimmed), {
      mode: 0o600
    })
  } else {
    console.warn('[speech] secret encryption unavailable — storing Azure Speech key in plaintext')
    writeFileSync(getAzureKeyPath(), trimmed, {
      encoding: 'utf8',
      mode: 0o600
    })
  }
  cachedAzureSpeechKey = trimmed
}

/** The stored key, else AZURE_SPEECH_KEY, else null. */
export function readAzureSpeechKey(): string | null {
  if (cachedAzureSpeechKey !== null) {
    return cachedAzureSpeechKey
  }
  const keyPath = getAzureKeyPath()
  if (existsSync(keyPath)) {
    try {
      const raw = readFileSync(keyPath)
      cachedAzureSpeechKey = getSecretStore().isEncryptionAvailable()
        ? getSecretStore().decryptString(raw)
        : raw.toString('utf8')
      return cachedAzureSpeechKey
    } catch {
      throw new Error('Azure Speech key could not be decrypted')
    }
  }
  return process.env.AZURE_SPEECH_KEY?.trim() || null
}

export function clearAzureSpeechKey(): void {
  cachedAzureSpeechKey = null
  rmSync(getAzureKeyPath(), { force: true })
}
