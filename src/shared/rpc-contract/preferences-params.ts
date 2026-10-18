import { z } from 'zod'

export const PreferencesUpdate = z
  .object({
    terminalRightClickToPaste: z.boolean().optional()
  })
  .strict()

export const KeybindingSet = z
  .object({
    actionId: z.string().trim().min(1).max(200),
    // null restores the shipped default.
    bindings: z.array(z.string().trim().min(1).max(100)).max(8).nullable()
  })
  .strict()
