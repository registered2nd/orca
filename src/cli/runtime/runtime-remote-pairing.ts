import {
  pairedRuntimeConnectionFromOffer,
  type PairedRuntimeConnection
} from '../../shared/paired-runtime-connection'
import { parsePairingCode } from '../../shared/pairing'
import { getPreferredPairedRuntimeConnection } from '../../shared/runtime-environments'
import { resolveEnvironment } from './environments'
import { RuntimeClientError } from './types'

export function resolveRemoteConnection(
  userDataPath: string,
  pairingCode: string | null,
  environmentSelector: string | null
): PairedRuntimeConnection | null {
  if (pairingCode && environmentSelector) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Use either --pairing-code or --environment, not both.'
    )
  }
  if (environmentSelector) {
    // Why the environment, not its offer: a relay-paired server's route lives beside the offer.
    return getPreferredPairedRuntimeConnection(
      resolveEnvironment(userDataPath, environmentSelector)
    )
  }
  if (!pairingCode) {
    return null
  }
  const pairing = parsePairingCode(pairingCode)
  if (!pairing) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Invalid remote pairing code. Expected an orca://pair?... URL or bare pairing payload.'
    )
  }
  return pairedRuntimeConnectionFromOffer(pairing)
}
