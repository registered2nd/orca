import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import nacl from 'tweetnacl'
import { WebSocketServer, type RawData, type WebSocket } from 'ws'
import { sendRemoteRuntimeRequest } from '../../../shared/remote-runtime/remote-runtime-client'
import type { PairedRuntimeRelayRoute } from '../../../shared/paired-runtime-connection'
import { DeviceRegistry } from '../device-registry'
import { MobileSocketWiring } from '../rpc/mobile-socket-wiring'
import { CloudRelayTransport } from '../rpc/relay-transport'
import { deriveRelayHostId } from './relay-http-client'

const INVITE = 'B'.repeat(43)

function forward(socket: WebSocket, raw: RawData, isBinary: boolean): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(raw, { binary: isBinary })
  }
}

// A one-cell relay: the host's data socket and one client splice once both have authenticated.
async function startFakeCell(hello: Record<string, unknown> | null) {
  const cell = new WebSocketServer({ host: '127.0.0.1', port: 0, perMessageDeflate: false })
  await new Promise<void>((resolve) => cell.once('listening', resolve))
  const address = cell.address()
  if (!address || typeof address === 'string') {
    throw new Error('expected a TCP address')
  }
  let host: WebSocket | null = null
  let client: WebSocket | null = null
  const relayAuth: unknown[] = []
  const splice = (): void => {
    if (!host || !client) {
      return
    }
    const [h, c] = [host, client]
    h.on('message', (raw, isBinary) => forward(c, raw, isBinary))
    c.on('message', (raw, isBinary) => forward(h, raw, isBinary))
    c.send(JSON.stringify(hello))
  }
  cell.on('connection', (socket, request) => {
    socket.once('message', (raw) => {
      if (request.url?.startsWith('/v1/host/data/')) {
        host = socket
      } else {
        relayAuth.push(JSON.parse(raw.toString()))
        if (!hello) {
          socket.send(JSON.stringify({ type: 'relay-hello', ok: false, code: 4404 }))
          return
        }
        client = socket
      }
      splice()
    })
  })
  return { cell, port: address.port, relayAuth }
}

describe('desktop runtime client over Orca Relay', () => {
  const cleanups: (() => Promise<void> | void)[] = []
  afterEach(async () => {
    for (const cleanup of cleanups.splice(0).toReversed()) {
      await cleanup()
    }
  })

  async function relayHost(hello: Record<string, unknown> | null) {
    const fake = await startFakeCell(hello)
    // Why bounded: the host's data socket outlives transport.stop(), so close() can wait on it.
    cleanups.push(
      () =>
        new Promise<void>((resolve) => {
          for (const socket of fake.cell.clients) {
            socket.terminate()
          }
          fake.cell.close(() => resolve())
          setTimeout(resolve, 2_000).unref()
        })
    )
    const userDataPath = mkdtempSync(join(tmpdir(), 'orca-runtime-relay-client-'))
    const registry = new DeviceRegistry(userDataPath)
    const device = registry.addDevice('Laptop', 'runtime')
    const keys = nacl.box.keyPair()
    const relayHostId = deriveRelayHostId(keys.publicKey)
    const received: { plaintext: string; capabilities: readonly string[]; transport: unknown }[] =
      []
    const wiring = new MobileSocketWiring({
      deviceRegistry: registry,
      e2eeKeypair: {
        publicKey: keys.publicKey,
        secretKey: keys.secretKey,
        publicKeyB64: Buffer.from(keys.publicKey).toString('base64')
      },
      onText: (socket, plaintext, reply) => {
        received.push({
          plaintext,
          capabilities: socket.clientCapabilities,
          transport: socket.transport
        })
        const request = JSON.parse(plaintext) as { id: string }
        reply(
          JSON.stringify({
            id: request.id,
            ok: true,
            result: { via: 'relay' },
            _meta: { runtimeId: 'rt-1' }
          })
        )
      },
      onBinary: vi.fn(),
      onClose: vi.fn()
    })
    const transport = new CloudRelayTransport({
      cellUrl: `http://127.0.0.1:${fake.port}`,
      relayHostId,
      generation: 1
    })
    // Why first in the list: cleanups run in reverse, and the profile goes only once nothing holds it.
    cleanups.unshift(() => rmSync(userDataPath, { recursive: true, force: true, maxRetries: 5 }))
    cleanups.push(() => transport.stop())
    wiring.attachTransport(transport, (socket) => transport.metadataFor(socket))
    await transport.start()
    await transport.openConnection({
      connId: 'connection-1',
      connTicket: 'A'.repeat(43),
      kind: 'invite',
      relayDeviceId: device.deviceId,
      attachDeadlineMs: 5_000
    })
    const route: PairedRuntimeRelayRoute = {
      cellUrl: `http://127.0.0.1:${fake.port}`,
      relayHostId,
      credential: INVITE,
      credentialKind: 'invite'
    }
    const connection = {
      // Why unreachable: a relay connection must never dial the host's own endpoint.
      endpoint: 'ws://127.0.0.1:1',
      hostPublicKeyB64: Buffer.from(keys.publicKey).toString('base64'),
      credential: { kind: 'token' as const, deviceToken: device.token },
      relay: route
    }
    return { fake, device, relayHostId, received, connection }
  }

  it('runs a request through the splice with v2 E2EE, carrying its capabilities', async () => {
    const { fake, device, relayHostId, received, connection } = await relayHost({
      type: 'relay-hello',
      ok: true,
      credentialKind: 'invite',
      leaseExpiresAt: Date.now() + 60_000
    })

    const response = await sendRemoteRuntimeRequest(
      connection,
      'host.platform',
      undefined,
      10_000,
      undefined,
      undefined,
      ['runtime.status.compat.v1']
    )

    expect(response).toMatchObject({ ok: true, result: { via: 'relay' } })
    expect(fake.relayAuth).toEqual([
      { type: 'relay-auth', v: 1, mode: 'connect', credential: INVITE }
    ])
    expect(received).toHaveLength(1)
    expect(JSON.parse(received[0].plaintext)).toMatchObject({ method: 'host.platform' })
    expect(received[0].capabilities).toContain('runtime.status.compat.v1')
    expect(received[0].transport).toMatchObject({
      transport: 'relay',
      relayHostId,
      relayDeviceId: device.deviceId
    })
  }, 20_000)

  it('fails with the relay refusal instead of dialing the host directly', async () => {
    const { connection } = await relayHost(null)

    await expect(
      sendRemoteRuntimeRequest(connection, 'host.platform', undefined, 10_000)
    ).rejects.toThrow('Orca Relay refused the connection (4404).')
  }, 20_000)
})
