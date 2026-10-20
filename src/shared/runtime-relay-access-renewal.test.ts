import { afterEach, describe, expect, it, vi } from 'vitest'
import type { KnownRuntimeEnvironment } from './runtime-environments'

const sendRemoteRuntimeRequest = vi.fn()
const writeEnvironmentRelayAccess = vi.fn()
vi.mock('./remote-runtime-client', () => ({ sendRemoteRuntimeRequest }))
vi.mock('./runtime-environment-relay-store', () => ({ writeEnvironmentRelayAccess }))

const { renewEnvironmentRelayAccessIfDue } = await import('./runtime-relay-access-renewal')

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 9, 19)

function environment(id: string, resumeExpiresAt: number): KnownRuntimeEnvironment {
  return {
    id,
    name: id,
    createdAt: 1,
    updatedAt: 1,
    lastUsedAt: null,
    runtimeId: null,
    endpoints: [
      {
        id: 'e1',
        kind: 'websocket',
        label: 'loopback',
        endpoint: 'ws://127.0.0.1:6768',
        deviceToken: 'token',
        publicKeyB64: Buffer.alloc(32, 1).toString('base64')
      }
    ],
    preferredEndpointId: 'e1',
    relayAccess: {
      directorUrl: 'https://relay.example',
      cellUrl: 'https://relay.example',
      relayHostId: 'AAAAAAAAAAAAAAAA',
      resumeToken: 'resume-token',
      resumeExpiresAt
    }
  }
}

afterEach(() => vi.clearAllMocks())

describe('renewEnvironmentRelayAccessIfDue', () => {
  it('leaves a credential with more than a week left alone', async () => {
    await renewEnvironmentRelayAccessIfDue(
      '/profile',
      environment('fresh', NOW + 20 * DAY),
      [],
      NOW
    )

    expect(sendRemoteRuntimeRequest).not.toHaveBeenCalled()
  })

  it('confirms over the relay and records the extended expiry, once per hour', async () => {
    sendRemoteRuntimeRequest.mockResolvedValue({
      ok: true,
      result: {
        v: 1,
        relay: null,
        resumeConfirmation: {
          v: 1,
          reqId: 'confirm-1',
          currentVersion: 1,
          acceptedAs: 'current',
          renewed: true,
          resumeExpiresAt: NOW + 30 * DAY
        }
      }
    })
    const due = environment('due', NOW + 2 * DAY)

    await renewEnvironmentRelayAccessIfDue('/profile', due, [], NOW)
    await renewEnvironmentRelayAccessIfDue('/profile', due, [], NOW + 60_000)

    expect(sendRemoteRuntimeRequest).toHaveBeenCalledTimes(1)
    const [connection, method, params] = sendRemoteRuntimeRequest.mock.calls[0]
    expect(connection.relay).toMatchObject({ credential: 'resume-token', credentialKind: 'resume' })
    expect(method).toBe('pairing.getEndpoints')
    expect(params.resumeConfirmReqId).toMatch(/^confirm-/)
    expect(writeEnvironmentRelayAccess).toHaveBeenCalledWith(
      '/profile',
      'due',
      expect.objectContaining({ resumeExpiresAt: NOW + 30 * DAY, resumeToken: 'resume-token' })
    )
  })
})
