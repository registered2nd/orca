import type { CommandHandler } from '../dispatch'
import { getOptionalStringFlag, getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime/types'
import type { CliPreferences, CliShortcut } from '../../shared/cli-preferences-types'

function formatPreferences(preferences: CliPreferences): string {
  return `terminal-right-click-paste: ${preferences.terminalRightClickToPaste ? 'on' : 'off'}`
}

function formatShortcut(shortcut: CliShortcut): string {
  const keys = shortcut.bindings.length > 0 ? shortcut.bindings.join(', ') : '(unassigned)'
  return `${shortcut.actionId}  ${keys}${shortcut.customized ? '  (custom)' : ''}  — ${shortcut.title}`
}

function parseOnOff(flag: string, value: string): boolean {
  if (value !== 'on' && value !== 'off') {
    throw new RuntimeClientError('invalid_argument', `--${flag} must be on or off`)
  }
  return value === 'on'
}

export const PREFERENCES_HANDLERS: Record<string, CommandHandler> = {
  'settings show': async ({ client, json }) => {
    printResult(await client.call<CliPreferences>('preferences.get'), json, formatPreferences)
  },
  'settings set': async ({ client, flags, json }) => {
    const rightClick = getOptionalStringFlag(flags, 'terminal-right-click-paste')
    if (rightClick === undefined) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Nothing to set: pass --terminal-right-click-paste on|off'
      )
    }
    printResult(
      await client.call<CliPreferences>('preferences.update', {
        terminalRightClickToPaste: parseOnOff('terminal-right-click-paste', rightClick)
      }),
      json,
      formatPreferences
    )
  },
  'shortcut list': async ({ client, flags, json }) => {
    const match = getOptionalStringFlag(flags, 'match')?.toLowerCase()
    const response = await client.call<{ shortcuts: CliShortcut[] }>('preferences.shortcuts.list')
    const shortcuts = match
      ? response.result.shortcuts.filter((shortcut) =>
          `${shortcut.actionId} ${shortcut.title}`.toLowerCase().includes(match)
        )
      : response.result.shortcuts
    printResult({ ...response, result: { shortcuts } }, json, (result) =>
      result.shortcuts.map(formatShortcut).join('\n')
    )
  },
  'shortcut set': async ({ client, flags, json }) => {
    const actionId = getRequiredStringFlag(flags, 'action')
    const reset = flags.get('reset') === true
    const keys = getOptionalStringFlag(flags, 'keys')
    if (reset === (keys !== undefined)) {
      throw new RuntimeClientError('invalid_argument', 'Pass exactly one of --keys or --reset')
    }
    const bindings = reset
      ? null
      : keys === 'none'
        ? []
        : (keys ?? '')
            .split(',')
            .map((binding) => binding.trim())
            .filter(Boolean)
    printResult(
      await client.call<CliShortcut>('preferences.shortcuts.set', { actionId, bindings }),
      json,
      formatShortcut
    )
  }
}
