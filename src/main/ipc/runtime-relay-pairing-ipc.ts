import { ipcMain } from 'electron'
import type { OrcaRuntimeRpcServer } from '../runtime/rpc/server/runtime-rpc'
import { registerMobileHandlers } from './mobile'

/** The phone pairing handlers, plus the relay link a desktop or CLI client pairs with. */
export function registerMobileAndRuntimeRelayPairingHandlers(
  rpcServer: OrcaRuntimeRpcServer,
  dependencies: Parameters<typeof registerMobileHandlers>[1]
): void {
  registerMobileHandlers(rpcServer, dependencies)
  registerRuntimeRelayPairingHandler(rpcServer)
}

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
