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

export const AppUiInvokeParams = z.object({
  name: z.string().min(1, 'Missing renderer action name'),
  args: z.array(z.unknown()).max(32).default([])
})

export const AppUiStateParams = z.object({
  path: z.string().default('')
})

export const AppUiLoadTerminalsParams = z.object({
  waitMs: z.number().int().min(0).max(300_000).default(30_000)
})
