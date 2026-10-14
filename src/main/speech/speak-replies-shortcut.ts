import { keybindingMatchesAction } from '../../shared/keybindings/matching'
import type { KeybindingMatchOptions, KeybindingOverrides } from '../../shared/keybindings/types'
import type { WindowShortcutInput } from '../../shared/window-shortcut-policy'
import { sendSpeakControl, toggleSpeakReplies } from './speak-replies-service'

/** Consumes the read-aloud toggle/stop chords from the main window or a browser guest. */
export function handleSpeakRepliesShortcut(
  event: Electron.Event,
  input: WindowShortcutInput & { isAutoRepeat?: boolean },
  keybindings: KeybindingOverrides | undefined,
  options: KeybindingMatchOptions = {}
): boolean {
  if (input.type !== 'keyDown') {
    return false
  }
  const match = (id: 'voice.speakReplies.toggle' | 'voice.speakReplies.stop'): boolean =>
    keybindingMatchesAction(id, input, process.platform, keybindings, options)
  const toggle = match('voice.speakReplies.toggle')
  if (!toggle && !match('voice.speakReplies.stop')) {
    return false
  }
  event.preventDefault()
  if (!input.isAutoRepeat) {
    if (toggle) {
      toggleSpeakReplies()
    } else {
      sendSpeakControl({ action: 'stop' })
    }
  }
  return true
}
