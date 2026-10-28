import type { HandlerGroup } from './handler-group-manifest'

export const APP_FUNCTIONS_HANDLER_GROUP: HandlerGroup = {
  name: 'app-functions',
  keys: [
    'app functions',
    'app invoke',
    'app ui actions',
    'app ui invoke',
    'app ui state',
    'app terminals list',
    'app terminals load',
    'app terminals activate'
  ],
  load: async () => (await import('./handlers/app-functions.js')).APP_FUNCTION_HANDLERS
}
