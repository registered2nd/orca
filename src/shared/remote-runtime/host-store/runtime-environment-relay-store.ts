import { pairedRuntimeConnectionFromOffer } from '../pairing/paired-runtime-connection'
import { parsePairingCode } from '../pairing/pairing'
import type { RuntimeCapability } from '../protocol/protocol-version'
import type * as relayStore from './runtime-environment-relay-store-operations'
import { submitEnvironmentStoreCommand } from './runtime-environment-store-worker-client'
import {
  addEnvironmentFromPairingCode,
  addOrUpdateEnvironmentFromPairingCode,
  type AddEnvironmentOutcome
} from './runtime-environment-store'
import { RuntimeEnvironmentStoreError } from './runtime-environment-store-records'
import { installRuntimeRelayAccess } from '../relay/runtime-relay-access'
import type { KnownRuntimeEnvironment } from '../host-catalog/runtime-environments'

/** Whether a pairing link reaches its server through Orca Relay rather than a direct address. */
export function isRelayPairingCode(pairingCode: string): boolean {
  return Boolean(parsePairingCode(pairingCode)?.relay)
}

/** Records the resume credential a saved server is reached through. */
export async function writeEnvironmentRelayAccess(
  ...args: Parameters<typeof relayStore.writeEnvironmentRelayAccess>
): Promise<KnownRuntimeEnvironment> {
  const reply = await submitEnvironmentStoreCommand({
    operation: 'writeEnvironmentRelayAccess',
    args
  })
  if (reply.operation !== 'writeEnvironmentRelayAccess') {
    throw new Error('Unexpected environment store response')
  }
  return reply.value
}

async function assertRelayPairingSavable(
  ...args: Parameters<typeof relayStore.assertRelayPairingSavable>
): Promise<void> {
  const reply = await submitEnvironmentStoreCommand({
    operation: 'assertRelayPairingSavable',
    args
  })
  if (reply.operation !== 'assertRelayPairingSavable') {
    throw new Error('Unexpected environment store response')
  }
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
  await assertRelayPairingSavable(userDataPath, offer.publicKeyB64, args.name, refreshSameServer)
  const relayAccess = await installRuntimeRelayAccess(
    offer,
    pairedRuntimeConnectionFromOffer(offer),
    args.clientCapabilities
  )
  const saveArgs = { name: args.name, pairingCode: args.pairingCode, runtimeId: args.runtimeId }
  const outcome = refreshSameServer
    ? await addOrUpdateEnvironmentFromPairingCode(userDataPath, saveArgs)
    : {
        environment: await addEnvironmentFromPairingCode(userDataPath, saveArgs),
        updatedExisting: false
      }
  return {
    ...outcome,
    environment: await writeEnvironmentRelayAccess(
      userDataPath,
      outcome.environment.id,
      relayAccess
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
    : await addEnvironmentFromPairingCode(userDataPath, args)
}
