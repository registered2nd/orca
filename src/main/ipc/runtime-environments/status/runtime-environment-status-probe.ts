import { resolveEnvironment } from '../../../../shared/remote-runtime/host-store/runtime-environment-store'
import { ELECTRON_REMOTE_RUNTIME_CLIENT_CAPABILITIES } from '../../../../shared/remote-runtime/protocol/electron-remote-runtime-client-capabilities'
import {
  getOrcadSshDeployment,
  getPreferredPairedRuntimeConnection,
  getPreferredPairingOffer,
  type KnownRuntimeEnvironment
} from '../../../../shared/remote-runtime/host-catalog/runtime-environments'
import type { RuntimeRpcResponse } from '../../../../shared/remote-runtime/rpc/runtime-rpc-envelope'
import type { RuntimeStatus } from '../../../../shared/remote-runtime/session-graph/runtime-session-contracts'
import { getRuntimeEnvironmentCapabilityIncarnation } from '../connections/runtime-environment-capability-evidence'
import { getRuntimeEnvironmentStatusOwner } from '../connections/runtime-environment-request-connections'
import {
  isRuntimeEnvironmentManuallyDisconnected,
  runtimeEnvironmentManualDisconnectReason
} from '../connectivity/runtime-environment-manual-disconnect'
import { runtimeEnvironmentChangedFailure } from '../requests/runtime-environment-revision-guard'
import { attachRemoteControlDiagnostics } from './runtime-environment-status-diagnostics'
import { withTailscaleHintForResponse } from '../requests/runtime-environment-tailscale-response'

export async function getRuntimeEnvironmentStatus(
  userDataPath: string,
  selector: string,
  timeoutMs?: number,
  options?: { observeOnly?: true; signal?: AbortSignal; reconnect?: true; force?: true },
  /** False for a caller pinned to this pairing revision, which a re-pair must fail instead. */
  followRepair = true
): Promise<RuntimeRpcResponse<RuntimeStatus>> {
  const environment = await resolveEnvironment(userDataPath, selector)
  if (isRuntimeEnvironmentManuallyDisconnected(environment.id)) {
    return {
      id: 'status.get',
      ok: false,
      error: {
        code: 'runtime_manually_disconnected',
        message: runtimeEnvironmentManualDisconnectReason(environment.id)
      }
    }
  }
  const incarnation = getRuntimeEnvironmentCapabilityIncarnation(environment.id)
  const response = await (
    await getRuntimeEnvironmentStatusOwner(userDataPath, environment.id)
  ).refresh({
    timeoutMs,
    ...options
  })
  if (response.ok && environment.relayAccess) {
    // Why fire-and-forget: renewal only matters within a week of expiry and must not slow status.
    // Why lazy: only relay-paired servers renew, so every other probe skips the relay store's imports.
    void import('../../../../shared/remote-runtime/relay/runtime-relay-access-renewal')
      .then(({ renewEnvironmentRelayAccessIfDue }) =>
        renewEnvironmentRelayAccessIfDue(
          userDataPath,
          environment,
          ELECTRON_REMOTE_RUNTIME_CLIENT_CAPABILITIES
        )
      )
      .catch((error: unknown) =>
        console.warn('[runtime-environments] Relay renewal failed:', error)
      )
  }
  // A retired request must not publish old status or borrow its replacement's diagnostics.
  if (getRuntimeEnvironmentCapabilityIncarnation(environment.id) !== incarnation) {
    // Follow one repair started by this probe; the successor owner verifies the new pairing.
    return followRepair && (await repairedSameServer(userDataPath, environment))
      ? getRuntimeEnvironmentStatus(userDataPath, environment.id, timeoutMs, options, false)
      : runtimeEnvironmentChangedFailure(environment, 'status.get')
  }
  return attachRemoteControlDiagnostics(
    withTailscaleHintForResponse(
      response,
      getPreferredPairedRuntimeConnection(environment).endpoint,
      environment
    ),
    environment.id
  )
}

/** Follow only SSH-managed repairs under the same pinned host key; other replacements remain changed. */
async function repairedSameServer(
  userDataPath: string,
  before: KnownRuntimeEnvironment
): Promise<boolean> {
  try {
    const after = await resolveEnvironment(userDataPath, before.id)
    return (
      (after.pairingRevision ?? after.createdAt) !== (before.pairingRevision ?? before.createdAt) &&
      getOrcadSshDeployment(before) !== undefined &&
      getOrcadSshDeployment(after) !== undefined &&
      getPreferredPairingOffer(after).publicKeyB64 === getPreferredPairingOffer(before).publicKeyB64
    )
  } catch {
    return false
  }
}
