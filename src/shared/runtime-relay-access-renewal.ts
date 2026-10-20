import { randomBytes } from 'node:crypto'
import { PairingGetEndpointsResultSchema } from './mobile-relay-credential-contract'
import type { RuntimeCapability } from './protocol-version'
import { sendRemoteRuntimeRequest } from './remote-runtime-client'
import { writeEnvironmentRelayAccess } from './runtime-environment-relay-store'
import {
  getPreferredPairedRuntimeConnection,
  type KnownRuntimeEnvironment
} from './runtime-environments'

// The relay keeps a resume credential 30 days; confirming it on a resume splice extends that.
const RENEW_WITHIN_MS = 7 * 24 * 60 * 60 * 1000
const RETRY_AFTER_MS = 60 * 60 * 1000
const CONFIRM_TIMEOUT_MS = 20_000
const lastAttemptAt = new Map<string, number>()

/** Extends a relay-paired server's resume credential once it is within a week of expiring. */
export async function renewEnvironmentRelayAccessIfDue(
  userDataPath: string,
  environment: KnownRuntimeEnvironment,
  clientCapabilities: readonly RuntimeCapability[] = [],
  now = Date.now()
): Promise<void> {
  const access = environment.relayAccess
  if (!access || access.resumeExpiresAt - now > RENEW_WITHIN_MS) {
    return
  }
  if (now - (lastAttemptAt.get(environment.id) ?? 0) < RETRY_AFTER_MS) {
    return
  }
  lastAttemptAt.set(environment.id, now)
  const response = await sendRemoteRuntimeRequest<unknown>(
    getPreferredPairedRuntimeConnection(environment),
    'pairing.getEndpoints',
    { resumeConfirmReqId: `confirm-${randomBytes(16).toString('base64url')}` },
    CONFIRM_TIMEOUT_MS,
    undefined,
    undefined,
    clientCapabilities
  )
  const read = response.ok ? PairingGetEndpointsResultSchema.safeParse(response.result) : null
  if (!read?.success || !read.data.resumeConfirmation) {
    return
  }
  writeEnvironmentRelayAccess(userDataPath, environment.id, {
    ...access,
    ...(read.data.relay ? { cellUrl: read.data.relay.cellUrl } : {}),
    resumeExpiresAt: read.data.resumeConfirmation.resumeExpiresAt
  })
}
