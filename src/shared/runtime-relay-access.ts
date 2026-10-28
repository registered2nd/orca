import { createHash, randomBytes } from 'node:crypto'
import {
  DeviceCredentialInstalledSchema,
  PairingGetEndpointsResultSchema
} from './mobile-relay-credential-contract'
import type { PairedRuntimeConnection, PairedRuntimeRelayRoute } from './paired-runtime-connection'
import type { PairingOffer } from './pairing'
import type { RuntimeCapability } from './protocol-version'
import { sendRemoteRuntimeRequest } from './remote-runtime/remote-runtime-client'
import { RemoteRuntimeClientError } from './remote-runtime/remote-runtime-client-error'
import type { RuntimeRelayAccess } from './runtime-relay-access-schema'

const INSTALL_TIMEOUT_MS = 30_000

function base64Url(bytes: Buffer): string {
  return bytes.toString('base64url')
}

function failure(message: string): RemoteRuntimeClientError {
  return new RemoteRuntimeClientError('remote_runtime_unavailable', message)
}

/**
 * Trades a relay pairing link's one-time invite for this client's own resume credential, as a
 * phone does after scanning: provision through the invite splice, then prove the resume token
 * works by reading the committed install through it.
 */
export async function installRuntimeRelayAccess(
  offer: PairingOffer,
  inviteConnection: PairedRuntimeConnection,
  clientCapabilities: readonly RuntimeCapability[] = []
): Promise<RuntimeRelayAccess> {
  if (!offer.relay || !inviteConnection.relay) {
    throw failure('This pairing link does not reach the server through Orca Relay.')
  }
  const resumeToken = base64Url(randomBytes(32))
  const reqId = `install-${base64Url(randomBytes(12))}`
  const installed = await sendRemoteRuntimeRequest<unknown>(
    inviteConnection,
    'pairing.provisionRelay',
    {
      reqId,
      newResumeTokenHash: base64Url(createHash('sha256').update(resumeToken, 'utf8').digest())
    },
    INSTALL_TIMEOUT_MS,
    undefined,
    undefined,
    clientCapabilities
  )
  if (!installed.ok) {
    throw failure(`The server refused the Relay credential: ${installed.error.message}`)
  }
  const credential = DeviceCredentialInstalledSchema.safeParse(installed.result)
  if (!credential.success) {
    throw failure('The server answered the Relay credential install in an unexpected shape.')
  }
  const route: PairedRuntimeRelayRoute = {
    cellUrl: offer.relay.cellUrl,
    relayHostId: offer.relay.relayHostId,
    credential: resumeToken,
    credentialKind: 'resume'
  }
  const endpoints = await sendRemoteRuntimeRequest<unknown>(
    { ...inviteConnection, relay: route },
    'pairing.getEndpoints',
    { installReqId: reqId },
    INSTALL_TIMEOUT_MS,
    undefined,
    undefined,
    clientCapabilities
  )
  const read = endpoints.ok ? PairingGetEndpointsResultSchema.safeParse(endpoints.result) : null
  if (!read?.success || read.data.installStatus?.state !== 'committed' || !read.data.relay) {
    throw failure('The Relay credential did not commit; generate a new link on the server.')
  }
  return {
    directorUrl: read.data.relay.directorUrl,
    cellUrl: read.data.relay.cellUrl,
    relayHostId: read.data.relay.relayHostId,
    resumeToken,
    resumeExpiresAt: credential.data.resumeExpiresAt
  }
}
