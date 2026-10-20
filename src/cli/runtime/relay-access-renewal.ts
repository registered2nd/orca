import { renewEnvironmentRelayAccessIfDue } from '../../shared/runtime-relay-access-renewal'
import { markEnvironmentUsed, resolveEnvironment } from './environments'

/** After a successful call to a saved server: note the use, then renew its relay credential if due. */
export async function recordEnvironmentUse(
  client: { userDataPath: string; environmentSelector: string | null },
  runtimeId: string
): Promise<void> {
  const { userDataPath, environmentSelector: selector } = client
  if (!selector) {
    return
  }
  markEnvironmentUsed(userDataPath, selector, { runtimeId })
  // Why quiet: renewal is housekeeping for a later call; it must never fail the one that succeeded.
  try {
    await renewEnvironmentRelayAccessIfDue(userDataPath, resolveEnvironment(userDataPath, selector))
  } catch {
    // A failed renewal retries on a later call; the credential stays valid for days.
  }
}
