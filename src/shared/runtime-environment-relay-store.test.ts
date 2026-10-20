import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { encodePairingOffer } from './pairing'
import { addEnvironmentFromPairingCode, listEnvironments } from './runtime-environment-store'
import type { RuntimeRelayAccess } from './runtime-relay-access-schema'

const installRuntimeRelayAccess = vi.fn()
vi.mock('./runtime-relay-access', () => ({ installRuntimeRelayAccess }))

const { addEnvironmentFromRelayPairingCode, addOrUpdateEnvironmentFromRelayPairingCode } =
  await import('./runtime-environment-relay-store')

const serverKey = Buffer.alloc(32, 7).toString('base64')
const relayAccess: RuntimeRelayAccess = {
  directorUrl: 'https://relay.example',
  cellUrl: 'https://relay-c1.example',
  relayHostId: 'AbCdEf0123_-xyZ9',
  resumeToken: 'resume-token',
  resumeExpiresAt: Date.UTC(2026, 11, 1)
}

function directCode(publicKeyB64 = serverKey) {
  return encodePairingOffer({
    v: 2,
    endpoint: 'ws://192.0.2.10:6768',
    deviceToken: 'direct-token',
    publicKeyB64
  })
}

function relayCode() {
  return encodePairingOffer({
    v: 2,
    endpoint: 'ws://127.0.0.1:6768',
    deviceToken: 'relay-token',
    publicKeyB64: serverKey,
    scope: 'runtime',
    relay: {
      v: 1,
      directorUrl: relayAccess.directorUrl,
      cellUrl: relayAccess.cellUrl,
      assignmentEpoch: 7,
      relayHostId: relayAccess.relayHostId,
      inviteToken: 'abcdefghijklmnopqrstuvwxyzABCDEFGH012345678',
      inviteExpiresAt: Date.now() + 5 * 60 * 1000,
      e2eeFraming: 2
    }
  })
}

describe('saving a server from a relay pairing link', () => {
  let userDataPath: string
  beforeEach(() => {
    userDataPath = mkdtempSync(join(tmpdir(), 'orca-runtime-env-relay-store-'))
    installRuntimeRelayAccess.mockReset().mockResolvedValue(relayAccess)
  })
  afterEach(() => {
    rmSync(userDataPath, { recursive: true, force: true })
  })

  it('saves a new server with its resume credential', async () => {
    const outcome = await addOrUpdateEnvironmentFromRelayPairingCode(userDataPath, {
      name: 'Studio',
      pairingCode: relayCode()
    })

    expect(outcome.updatedExisting).toBe(false)
    expect(outcome.environment).toMatchObject({ name: 'Studio', relayAccess })
    expect(listEnvironments(userDataPath)).toEqual([outcome.environment])
  })

  it('refreshes the saved server a relay link is for instead of saving it twice', async () => {
    const first = addEnvironmentFromPairingCode(userDataPath, {
      name: 'Studio',
      pairingCode: directCode()
    })

    const outcome = await addOrUpdateEnvironmentFromRelayPairingCode(userDataPath, {
      name: 'Studio over relay',
      pairingCode: relayCode(),
      runtimeId: 'runtime-after-restart'
    })

    expect(outcome.updatedExisting).toBe(true)
    expect(outcome.environment).toMatchObject({
      id: first.id,
      name: 'Studio',
      runtimeId: 'runtime-after-restart',
      relayAccess
    })
    expect(listEnvironments(userDataPath)).toEqual([outcome.environment])
  })

  it('refuses a link for a saved server outside Settings before spending its invite', async () => {
    addEnvironmentFromPairingCode(userDataPath, { name: 'Studio', pairingCode: directCode() })

    await expect(
      addEnvironmentFromRelayPairingCode(userDataPath, {
        name: 'Studio again',
        pairingCode: relayCode()
      })
    ).rejects.toThrow('This server is already paired as "Studio".')
    expect(installRuntimeRelayAccess).not.toHaveBeenCalled()
  })

  it('refuses a name another server holds before spending the invite', async () => {
    addEnvironmentFromPairingCode(userDataPath, {
      name: 'Studio',
      pairingCode: directCode(Buffer.alloc(32, 9).toString('base64'))
    })

    await expect(
      addOrUpdateEnvironmentFromRelayPairingCode(userDataPath, {
        name: 'studio',
        pairingCode: relayCode()
      })
    ).rejects.toThrow('A server named "Studio" already exists.')
    expect(installRuntimeRelayAccess).not.toHaveBeenCalled()
  })
})
