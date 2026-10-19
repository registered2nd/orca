import { z } from 'zod'

export const AppFunctionsListParams = z
  .object({
    name: z.string().min(1).optional()
  })
  .optional()

// Why the bound: IPC handlers take a handful of positional arguments; a huge list is a caller bug.
export const AppFunctionsInvokeIpcParams = z.object({
  channel: z.string().min(1, 'Missing IPC channel name'),
  args: z.array(z.unknown()).max(32).default([])
})
