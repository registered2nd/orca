import { encodePairingOffer, PAIRING_OFFER_VERSION } from '../../../shared/pairing'
import { withTimeout } from '../../../shared/promise-timeout-fallback'
import { RuntimeRpcMobilePairing } from './runtime-rpc-mobile-pairing'
import { pairingUnavailable, type PairingOfferUnavailable } from './runtime-rpc-pairing-types'

const RELAY_PROVIDER_INSTALL_WAIT_MS = 15_000
const RELAY_UNAVAILABLE_GUIDANCE =
  'Orca Relay is not available on this desktop. Sign in to Orca Cloud, then generate the link again.'

export type RuntimeRelayPairingOffer =
  | PairingOfferUnavailable
  | { available: true; pairingUrl: string; endpoint: string; deviceId: string }

export class RuntimeRpcRuntimeRelayPairing extends RuntimeRpcMobilePairing {
  /**
   * A server-sharing link that reaches this desktop through Orca Relay, as a phone QR does. The
   * direct endpoint stays loopback: the relay carries the traffic, so the listener never widens.
   */
  async createRuntimeRelayPairingOffer(args: {
    name?: string
    rotate?: boolean
  }): Promise<RuntimeRelayPairingOffer> {
    const direct = this.createPairingOffer({
      address: '127.0.0.1',
      rotate: args.rotate,
      name: args.name,
      scope: 'runtime',
      reach: 'this-computer'
    })
    if (!direct.available) {
      return direct
    }
    if (!this.mobileRelayPairingProvider && this.mobileRelayPairingProviderInstaller) {
      await withTimeout(
        this.mobileRelayPairingProviderInstaller(),
        RELAY_PROVIDER_INSTALL_WAIT_MS,
        undefined
      )
    }
    const provider = this.mobileRelayPairingProvider
    const device = this.deviceRegistry?.getDevice(direct.deviceId)
    const publicKeyB64 = this.getE2EEPublicKey()
    if (!provider || !device?.token || !publicKeyB64) {
      return pairingUnavailable('relay_mint_failed', RELAY_UNAVAILABLE_GUIDANCE)
    }
    let minted: Awaited<ReturnType<typeof provider.createPairingRelay>>
    try {
      minted = await provider.createPairingRelay(device.deviceId)
    } catch (error) {
      console.warn('[runtime] Failed to create a Relay invite for server sharing:', error)
      return pairingUnavailable('relay_mint_failed', RELAY_UNAVAILABLE_GUIDANCE)
    }
    if (!this.setMobileRelayBinding(device.deviceId, minted.binding)) {
      this.queueOrRetainRelayDeviceRevoke(device.deviceId, minted.binding)
      return pairingUnavailable('relay_mint_failed', 'Could not store the Relay binding.')
    }
    const hostDescriptor = this.hostDescriptor
    return {
      available: true,
      endpoint: direct.endpoint,
      deviceId: device.deviceId,
      pairingUrl: encodePairingOffer({
        v: PAIRING_OFFER_VERSION,
        endpoint: direct.endpoint,
        deviceToken: device.token,
        publicKeyB64,
        pairedDeviceId: device.deviceId,
        scope: 'runtime',
        relay: minted.relay,
        ...(hostDescriptor ? { hostDescriptor } : {})
      })
    }
  }
}
