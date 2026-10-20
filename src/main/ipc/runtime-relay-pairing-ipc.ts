import { ipcMain } from 'electron'
import type { OrcaRuntimeRpcServer } from '../runtime/runtime-rpc'

// Why its own channel: the direct-address link widens the listener; a relay link never does.
export function registerRuntimeRelayPairingHandler(rpcServer: OrcaRuntimeRpcServer): void {
  ipcMain.handle(
    'mobile:getRuntimeRelayPairingUrl',
    async (_event, args?: { rotate?: boolean }) => {
      const offer = await rpcServer.createRuntimeRelayPairingOffer({
        rotate: args?.rotate,
        name: `Runtime ${new Date().toLocaleDateString()} (Relay)`
      })
      return offer.available
        ? {
            available: true as const,
            pairingUrl: offer.pairingUrl,
            endpoint: offer.endpoint,
            deviceId: offer.deviceId
          }
        : { available: false as const, reason: offer.reason, guidance: offer.guidance }
    }
  )
}
