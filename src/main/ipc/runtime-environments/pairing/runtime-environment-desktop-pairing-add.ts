import { ELECTRON_REMOTE_RUNTIME_CLIENT_CAPABILITIES } from '../../../../shared/remote-runtime/protocol/electron-remote-runtime-client-capabilities'
import type { KnownRuntimeEnvironment } from '../../../../shared/remote-runtime/host-catalog/runtime-environments'
import { addEnvironmentFromAnyPairingCode } from '../../../../shared/remote-runtime/host-store/runtime-environment-relay-store'

/** Saves a server from a pasted pairing link, relay or direct, as this desktop client. */
export function addDesktopEnvironmentFromPairingCode(
  userDataPath: string,
  args: { name: string; pairingCode: string }
): Promise<KnownRuntimeEnvironment> {
  return addEnvironmentFromAnyPairingCode(
    userDataPath,
    args,
    ELECTRON_REMOTE_RUNTIME_CLIENT_CAPABILITIES
  )
}
