import type { HandlerGroup } from './handler-group-manifest'

export const VOICE_HANDLER_GROUP: HandlerGroup = {
  name: 'voice',
  keys: [
    'voice status',
    'voice speak on',
    'voice speak off',
    'voice set',
    'voice stop',
    'voice say',
    'voice azure-key set',
    'voice azure-key clear',
    'voice dictation on',
    'voice dictation off'
  ],
  load: async () => (await import('./handlers/voice.js')).VOICE_HANDLERS
}
