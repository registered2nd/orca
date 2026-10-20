import {
  readCurrentRuntimeEnvironmentSidecarEntry,
  writeRuntimeEnvironmentSidecarEntry
} from './runtime-environment-sidecar'
import { readPersistedEnvironmentStore } from './runtime-environment-store-file'
import { resolveEnvironment } from './runtime-environment-store-operations'
import { RuntimeEnvironmentStoreError } from './runtime-environment-store-records'
import { findEnvironmentWithHostKey } from '../host-catalog/runtime-environment-host-key-match'
import { findCollidingEnvironmentName } from '../host-catalog/runtime-environment-name-collision'
import { assertPairingReplaceableByAdd } from './runtime-environment-pairing-replace-guards'
import type { RuntimeRelayAccess } from '../relay/runtime-relay-access-schema'
import {
  PersistedRuntimeEnvironmentSchema,
  type KnownRuntimeEnvironment
} from '../host-catalog/runtime-environments'

/** Records the resume credential a saved server is reached through. */
export function writeEnvironmentRelayAccess(
  userDataPath: string,
  environmentId: string,
  relayAccess: RuntimeRelayAccess
): KnownRuntimeEnvironment {
  const environments = readPersistedEnvironmentStore(userDataPath).environments
  const persisted = environments.find((entry) => entry.id === environmentId)
  if (!persisted) {
    throw new RuntimeEnvironmentStoreError('invalid_argument', 'The saved server no longer exists.')
  }
  const current = readCurrentRuntimeEnvironmentSidecarEntry(
    userDataPath,
    PersistedRuntimeEnvironmentSchema.parse(persisted)
  )
  const { binding: _binding, pendingBinding: _pending, ...state } = current ?? {}
  writeRuntimeEnvironmentSidecarEntry(userDataPath, environments, persisted, {
    ...state,
    relayAccess
  })
  return resolveEnvironment(userDataPath, environmentId)
}

/** Refuses what the save would refuse, before the one-time invite is spent. */
export function assertRelayPairingSavable(
  userDataPath: string,
  publicKeyB64: string,
  name: string,
  refreshSameServer: boolean
): void {
  const environments = readPersistedEnvironmentStore(userDataPath).environments
  const sameServer = findEnvironmentWithHostKey(environments, publicKeyB64)
  if (sameServer) {
    const saved = resolveEnvironment(userDataPath, sameServer.id)
    assertPairingReplaceableByAdd(saved, undefined, refreshSameServer)
    return
  }
  const colliding = findCollidingEnvironmentName(environments, name)
  if (colliding) {
    throw new RuntimeEnvironmentStoreError(
      'invalid_argument',
      `A server named "${colliding.name}" already exists.`
    )
  }
}
