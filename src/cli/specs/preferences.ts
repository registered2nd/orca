import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const PREFERENCES_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['settings', 'show'],
    summary: 'Show the Orca settings this CLI can change',
    usage: 'orca settings show [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    examples: ['orca settings show']
  },
  {
    path: ['settings', 'set'],
    summary: 'Change an Orca setting in the running app',
    usage: 'orca settings set --terminal-right-click-paste on|off [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'terminal-right-click-paste'],
    notes: [
      'terminal-right-click-paste: on, right-click in a terminal copies a selection or pastes, and Ctrl+right-click opens the menu; off, right-click opens the menu.'
    ],
    examples: ['orca settings set --terminal-right-click-paste off']
  },
  {
    path: ['shortcut', 'list'],
    summary: 'List keyboard shortcuts with their action ids and current keys',
    usage: 'orca shortcut list [--match <text>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'match'],
    examples: ['orca shortcut list --match ask']
  },
  {
    path: ['shortcut', 'set'],
    summary: 'Rebind a keyboard shortcut, or restore its default',
    usage: 'orca shortcut set --action <id> (--keys <keys>[,<keys>] | --reset) [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'action', 'keys', 'reset'],
    notes: [
      'Keys use the Settings notation, e.g. Alt+Shift+A or Mod+Shift+K (Mod is Cmd on macOS, Ctrl elsewhere). --keys none unbinds the action. A chord another shortcut already uses is refused.'
    ],
    examples: [
      'orca shortcut set --action terminal.askAboutSelection --keys Alt+Shift+K',
      'orca shortcut set --action terminal.askAboutSelection --reset'
    ]
  }
]
