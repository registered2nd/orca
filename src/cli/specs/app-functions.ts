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
  },
  {
    path: ['app', 'ui', 'actions'],
    summary: 'List every action and state field of the Orca window (tabs, panes, sidebar, dialogs)',
    usage: 'orca app ui actions [--filter <text>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'filter'],
    notes: [
      'Reads the open window live: each action is a function of its store, the one a click, menu item or shortcut calls, so a new UI feature appears here with no extra wiring.',
      'Local Orca only, and the window must be open.'
    ],
    examples: ['orca app ui actions --filter tab', 'orca app ui actions --json']
  },
  {
    path: ['app', 'ui', 'invoke'],
    summary: 'Run one window action with positional arguments, and print its result',
    usage: 'orca app ui invoke <name> [--args <json> | --args-file <path|->] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'name', 'args', 'args-file'],
    positionalArgs: ['name'],
    notes: [
      "Arguments are a JSON array of the action's positional arguments; omit --args for none.",
      'An action that throws exits non-zero with code app_function_failed.'
    ],
    examples: [
      'orca app ui invoke setActiveWorktree --args \'["<worktreeId>"]\'',
      'orca app ui invoke toggleSidebar'
    ]
  },
  {
    path: ['app', 'ui', 'state'],
    summary: 'Print the window state at a dotted path (all of it when omitted)',
    usage: 'orca app ui state [<path>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'path'],
    positionalArgs: ['path'],
    examples: ['orca app ui state activeWorktreeId', 'orca app ui state tabsByWorktree --json']
  },
  {
    path: ['app', 'terminals', 'list'],
    summary: 'List every terminal tab the window holds, with whether it is loaded',
    usage: 'orca app terminals list [--unloaded] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'unloaded'],
    notes: [
      'A tab is loaded once it is attached to a terminal process. After a restart, restored tabs stay unloaded until opened or until `orca app terminals load` runs.'
    ],
    examples: ['orca app terminals list --unloaded']
  },
  {
    path: ['app', 'terminals', 'load'],
    summary: 'Load every restored terminal tab in the background, as opening each would',
    usage: 'orca app terminals load [--wait-ms <ms>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'wait-ms'],
    notes: [
      'Mounts every unloaded tab off-screen and wakes slept agents without changing what the window shows, then waits up to --wait-ms (default 30000) for each to attach. Exits non-zero with code terminals_not_loaded if some never do.'
    ],
    examples: ['orca app terminals load', 'orca app terminals load --wait-ms 60000 --json']
  },
  {
    path: ['app', 'terminals', 'activate'],
    summary: 'Switch the window to a terminal tab and its workspace',
    usage: 'orca app terminals activate <tabId> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'tab'],
    positionalArgs: ['tab'],
    examples: ['orca app terminals activate <tabId>']
  }
]
