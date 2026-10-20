import type { PairedE2EEAuthCredential } from './paired-e2ee-client-handshake'
import type { PairingOffer } from './pairing'

// What a client needs to connect to a paired host. Why not PairingOffer: an offer is
// pairing input; a connection carries a credential that will not always be a token.
export type PairedRuntimeConnection = {
  endpoint: string
  hostPublicKeyB64: string
  credential: PairedE2EEAuthCredential
  pairedDeviceId?: string
  // Present when the host is reached through Orca Relay instead of `endpoint`.
  relay?: PairedRuntimeRelayRoute
}

export type PairedRuntimeRelayRoute = {
  cellUrl: string
  relayHostId: string
  // The pairing invite on first contact, then the resume token installed with it.
  credential: string
  credentialKind: 'invite' | 'resume'
}

type OfferConnectionFields = Pick<
  PairingOffer,
  'endpoint' | 'deviceToken' | 'publicKeyB64' | 'pairedDeviceId'
> &
  Partial<Pick<PairingOffer, 'v' | 'scope' | 'relay'>>

export function pairedRuntimeConnectionFromOffer(
  offer: OfferConnectionFields
): PairedRuntimeConnection {
  return {
    endpoint: offer.endpoint,
    hostPublicKeyB64: offer.publicKeyB64,
    credential: { kind: 'token', deviceToken: offer.deviceToken },
    ...(offer.pairedDeviceId ? { pairedDeviceId: offer.pairedDeviceId } : {}),
    // Why the invite: a relay link's endpoint is the host's loopback; only the relay reaches it.
    ...(offer.relay
      ? {
          relay: {
            cellUrl: offer.relay.cellUrl,
            relayHostId: offer.relay.relayHostId,
            credential: offer.relay.inviteToken,
            credentialKind: 'invite' as const
          }
        }
      : {})
  }
}

// The token request envelopes still carry on the wire.
export function pairedRuntimeConnectionToken(connection: PairedRuntimeConnection): string {
  return connection.credential.deviceToken
}
