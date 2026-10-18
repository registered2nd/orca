import type { HandlerGroup } from '../dispatch/handler-group-manifest'

export const PREFERENCES_HANDLER_GROUP: HandlerGroup = {
  name: 'preferences',
  keys: ['settings show', 'settings set', 'shortcut list', 'shortcut set'],
  load: async () => (await import('./preferences.js')).PREFERENCES_HANDLERS
}
