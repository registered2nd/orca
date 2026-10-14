import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const VOICE_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['voice', 'status'],
    summary: 'Show read-aloud, voice and dictation settings',
    usage: 'orca voice status [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    examples: ['orca voice status']
  },
  {
    path: ['voice', 'speak', 'on'],
    summary: 'Read finished agent replies aloud',
    usage: 'orca voice speak on [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Speaks the agent pane you last focused, or every agent with `orca voice set --scope all`. Uses Azure Speech when a key is available, else the system voice.'
    ],
    examples: ['orca voice speak on']
  },
  {
    path: ['voice', 'speak', 'off'],
    summary: 'Stop reading agent replies aloud',
    usage: 'orca voice speak off [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    examples: ['orca voice speak off']
  },
  {
    path: ['voice', 'set'],
    summary: 'Change who speaks, the voices, the speaking rate or the Azure region',
    usage:
      'orca voice set [--scope focused|all] [--voice <name>] [--voice-zh <name>] [--rate <percent>] [--region <region>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'scope', 'voice', 'voice-zh', 'rate', 'region'],
    examples: [
      'orca voice set --scope all',
      'orca voice set --voice en-US-Andrew:DragonHDLatestNeural --rate 15'
    ]
  },
  {
    path: ['voice', 'stop'],
    summary: 'Stop the reply being read aloud now',
    usage: 'orca voice stop [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: ['Call it from a push-to-talk tool when recording starts so you can talk over a reply.'],
    examples: ['orca voice stop']
  },
  {
    path: ['voice', 'say'],
    summary: 'Read a piece of text aloud with the configured voice',
    usage: 'orca voice say --text <text> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'text'],
    examples: ['orca voice say --text "Build finished."']
  },
  {
    path: ['voice', 'azure-key', 'set'],
    summary: 'Store the Azure Speech key Orca uses for its voices',
    usage: 'orca voice azure-key set (--key <key> | --from-env) [--region <region>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'key', 'from-env', 'region'],
    notes: [
      'The key is encrypted at rest like other Orca credentials. Without a stored key Orca falls back to AZURE_SPEECH_KEY and AZURE_SPEECH_REGION from its own environment.'
    ],
    examples: ['orca voice azure-key set --from-env']
  },
  {
    path: ['voice', 'azure-key', 'clear'],
    summary: 'Remove the stored Azure Speech key',
    usage: 'orca voice azure-key clear [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    destructive: true,
    examples: ['orca voice azure-key clear']
  },
  {
    path: ['voice', 'dictation', 'on'],
    summary: 'Turn on voice dictation',
    usage: 'orca voice dictation on [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    examples: ['orca voice dictation on']
  },
  {
    path: ['voice', 'dictation', 'off'],
    summary: 'Turn off voice dictation',
    usage: 'orca voice dictation off [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    examples: ['orca voice dictation off']
  }
]
