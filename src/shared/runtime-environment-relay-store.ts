import { pairedRuntimeConnectionFromOffer } from './paired-runtime-connection'
import { parsePairingCode } from './pairing'
import type { RuntimeCapability } from './protocol-version'
import {
  readCurrentRuntimeEnvironmentSidecarEntry,
  writeRuntimeEnvironmentSidecarEntry
} from './runtime-environment-sidecar'
import { readPersistedEnvironmentStore } from './runtime-environment-store-file'
import {
  addEnvironmentFromPairingCode,
  addOrUpdateEnvironmentFromPairingCode,
  resolveEnvironment,
  RuntimeEnvironmentStoreError,
  type AddEnvironmentOutcome
} from './runtime-environment-store'
import { findEnvironmentWithHostKey } from './runtime-environment-host-key-match'
import { findCollidingEnvironmentName } from './runtime-environment-name-collision'
import { assertPairingReplaceableByAdd } from './runtime-environment-pairing-replace-guards'
import { installRuntimeRelayAccess } from './runtime-relay-access'
import type { RuntimeRelayAccess } from './runtime-relay-access-schema'
import {
  PersistedRuntimeEnvironmentSchema,
  type KnownRuntimeEnvironment
} from './runtime-environments'

/** Whether a pairing link reaches its server through Orca Relay rather than a direct address. */
export function isRelayPairingCode(pairingCode: string): boolean {
  return Boolean(parsePairingCode(pairingCode)?.relay)
}

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

type RelayPairingArgs = {
  name: string
  pairingCode: string
  clientCapabilities?: readonly RuntimeCapability[]
  /** Recorded only when the link turns out to be for an already saved server. */
  runtimeId?: string
}

/**
 * Saves a server from a relay pairing link: installs this client's resume credential first, so a
 * saved server is never left holding only the one-time invite.
 */
export async function addEnvironmentFromRelayPairingCode(
  userDataPath: string,
  args: RelayPairingArgs
): Promise<KnownRuntimeEnvironment> {
  return (await saveEnvironmentFromRelayPairingCode(userDataPath, args, false)).environment
}

/** Same, but a link for a saved server refreshes that server, as Settings' verified add does. */
export async function addOrUpdateEnvironmentFromRelayPairingCode(
  userDataPath: string,
  args: RelayPairingArgs
): Promise<AddEnvironmentOutcome> {
  return saveEnvironmentFromRelayPairingCode(userDataPath, args, true)
}

async function saveEnvironmentFromRelayPairingCode(
  userDataPath: string,
  args: RelayPairingArgs,
  refreshSameServer: boolean
): Promise<AddEnvironmentOutcome> {
  const offer = parsePairingCode(args.pairingCode)
  if (!offer?.relay) {
    throw new RuntimeEnvironmentStoreError(
      'invalid_argument',
      'This pairing link does not reach the server through Orca Relay.'
    )
  }
  assertRelayPairingSavable(userDataPath, offer.publicKeyB64, args.name, refreshSameServer)
  const relayAccess = await installRuntimeRelayAccess(
    offer,
    pairedRuntimeConnectionFromOffer(offer),
    args.clientCapabilities
  )
  const saveArgs = { name: args.name, pairingCode: args.pairingCode, runtimeId: args.runtimeId }
  const outcome = refreshSameServer
    ? addOrUpdateEnvironmentFromPairingCode(userDataPath, saveArgs)
    : { environment: addEnvironmentFromPairingCode(userDataPath, saveArgs), updatedExisting: false }
  return {
    ...outcome,
    environment: writeEnvironmentRelayAccess(userDataPath, outcome.environment.id, relayAccess)
  }
}

/** Refuses what the save would refuse, before the one-time invite is spent. */
function assertRelayPairingSavable(
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

/** Saves a server from any pairing link, relay or direct. */
export async function addEnvironmentFromAnyPairingCode(
  userDataPath: string,
  args: { name: string; pairingCode: string },
  clientCapabilities: readonly RuntimeCapability[]
): Promise<KnownRuntimeEnvironment> {
  return isRelayPairingCode(args.pairingCode)
    ? await addEnvironmentFromRelayPairingCode(userDataPath, { ...args, clientCapabilities })
    : addEnvironmentFromPairingCode(userDataPath, args)
}
