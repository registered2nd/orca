import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const APP_FUNCTION_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['app', 'functions'],
    summary: 'List every function the Orca UI can call in the app, with its arguments',
    usage: 'orca app functions [--filter <text>] [--kind ipc|rpc] [--all] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'filter', 'kind', 'all'],
    notes: [
      'Lists the IPC channels the desktop window calls in the main process (kind ipc, read live from the running app) and the runtime RPC methods no other orca command calls (kind rpc). --all adds the RPC methods other commands already cover.',
      'Each IPC entry gives its positional arguments with their TypeScript types where the source declares them, and the window.api member the UI calls it through.',
      '--filter matches the name or that window.api member, case-insensitively. Local Orca only: a paired or remote server refuses it.'
    ],
    examples: ['orca app functions --filter pairing --json', 'orca app functions --kind rpc --json']
  },
  {
    path: ['app', 'invoke'],
    summary: 'Run one of those functions exactly as the UI would, and print its result',
    usage:
      'orca app invoke <name> [--args <json> | --args-file <path|->] [--kind ipc|rpc] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'name', 'args', 'args-file', 'kind'],
    positionalArgs: ['name'],
    notes: [
      'An IPC function takes its positional arguments as a JSON array (--args \'[{"deviceId":"d1"}]\'); omit --args for none. It runs with the Orca window as its caller, as when the UI calls it, so the window must be open.',
      'An RPC method takes its params object as JSON (--args \'{"worktree":"id:…"}\').',
      '--args-file reads the JSON from a file, or from stdin with -, which avoids shell quoting (PowerShell strips the inner quotes of --args).',
      'A function that throws exits non-zero with code app_function_failed and its error in data.error. Pass --kind when an IPC channel and an RPC method share the name.'
    ],
    examples: [
      'orca app invoke mobile:listRuntimeAccessGrants --json',
      'orca app invoke mobile:getRuntimePairingUrl --args \'[{"address":"192.168.1.20","rotate":true,"reach":"network"}]\' --json',
      'orca app invoke mobile:revokeRuntimeAccess --args \'[{"deviceId":"<deviceId>"}]\' --json'
    ]
  }
]
