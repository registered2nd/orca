import { z } from 'zod'
import type { PairedRuntimeRelayRoute } from './paired-runtime-connection'

/** How a saved server is reached through Orca Relay once this client holds a resume credential. */
export const RuntimeRelayAccessSchema = z.object({
  directorUrl: z.string().url(),
  cellUrl: z.string().url(),
  relayHostId: z.string().min(1),
  resumeToken: z.string().min(1),
  resumeExpiresAt: z.number().int().nonnegative()
})
export type RuntimeRelayAccess = z.infer<typeof RuntimeRelayAccessSchema>

export function relayRouteFromAccess(access: RuntimeRelayAccess): PairedRuntimeRelayRoute {
  return {
    cellUrl: access.cellUrl,
    relayHostId: access.relayHostId,
    credential: access.resumeToken,
    credentialKind: 'resume'
  }
}
