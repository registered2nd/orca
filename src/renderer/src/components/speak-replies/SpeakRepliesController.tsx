import { useEffect, useSyncExternalStore } from 'react'
import { Square, Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ShortcutKeyCombo } from '@/components/ShortcutKeyCombo'
import { useShortcutKeyDetails } from '@/hooks/useShortcutLabel'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { getLastFocusedAgentPane, trackLastFocusedAgentPane } from '@/lib/last-focused-agent-pane'
import {
  getReplySpeechState,
  speakReply,
  stopReplySpeech,
  subscribeReplySpeech
} from './reply-speech-player'
import { finishedTurnReply, startedNewTurn } from './speak-replies-trigger'

// The status row holds only the turn's last text block; the agent's transcript has the whole turn.
async function speakWholeTurn(
  lastBlock: string,
  transcriptPath: string | undefined,
  paneKey: string
): Promise<void> {
  const whole = transcriptPath
    ? await window.api.speech.turnReplyText(transcriptPath).catch(() => null)
    : null
  // Why: the final block can reach the hook before it is flushed to the transcript.
  const text = !whole ? lastBlock : whole.includes(lastBlock) ? whole : `${whole}\n\n${lastBlock}`
  await speakReply(text, paneKey)
}

function useSpeakRepliesTriggers(): void {
  useEffect(() => {
    const mountedAt = Date.now()
    // Started before the store subscription below, so it has recorded focus by the time that reads it.
    const stopTracking = trackLastFocusedAgentPane()

    const unsubscribeStore = useAppStore.subscribe((state, previous) => {
      // Why: dictation does not stop the voice, so the user can talk while listening.
      const voice = state.settings?.voice
      if (previous.settings?.voice?.speakReplies && !voice?.speakReplies) {
        stopReplySpeech()
      }
      if (state.agentStatusByPaneKey === previous.agentStatusByPaneKey) {
        return
      }
      const speaking = getReplySpeechState()
      for (const [paneKey, entry] of Object.entries(state.agentStatusByPaneKey)) {
        const before = previous.agentStatusByPaneKey[paneKey]
        if (entry === before) {
          continue
        }
        if (speaking.speaking && speaking.paneKey === paneKey && startedNewTurn(entry, before)) {
          stopReplySpeech()
        }
        if (!voice?.speakReplies) {
          continue
        }
        if (voice.speakScope !== 'all' && paneKey !== getLastFocusedAgentPane()?.paneKey) {
          continue
        }
        const reply = finishedTurnReply(entry, before, mountedAt)
        if (reply) {
          void speakWholeTurn(reply, entry.providerSession?.transcriptPath, paneKey)
        }
      }
    })

    const unsubscribeControl = window.api.speech.onSpeakControl((event) => {
      if (event.action === 'stop') {
        stopReplySpeech()
      } else {
        void speakReply(event.text, null)
      }
    })

    return () => {
      unsubscribeStore()
      unsubscribeControl()
      stopTracking()
      stopReplySpeech()
    }
  }, [])
}

export function SpeakRepliesController(): React.JSX.Element | null {
  useSpeakRepliesTriggers()
  const speech = useSyncExternalStore(subscribeReplySpeech, getReplySpeechState)
  const shortcut = useShortcutKeyDetails('voice.speakReplies.stop')
  if (!speech.speaking) {
    return null
  }
  const stopLabel = translate('auto.components.speakReplies.controller.stop', 'Stop reading aloud')
  return (
    <div
      data-testid="speak-replies-indicator"
      className="fixed bottom-24 left-1/2 z-50 flex h-10 -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-popover/95 px-3 text-sm text-popover-foreground shadow-floating backdrop-blur"
    >
      <Volume2 className="size-4 text-muted-foreground" aria-hidden />
      <span className="font-medium">
        {translate('auto.components.speakReplies.controller.reading', 'Reading reply aloud')}
      </span>
      <span aria-hidden className="h-4 w-px shrink-0 bg-border" />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={stopLabel}
            className="shrink-0"
            onMouseDown={(event) => event.preventDefault()}
            onClick={stopReplySpeech}
          >
            <Square className="size-3 fill-current" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6}>
          <span className="flex items-center gap-1.5">
            {stopLabel}
            {shortcut.keys.length > 0 ? (
              <ShortcutKeyCombo keys={shortcut.keys} doubleTap={shortcut.doubleTap} />
            ) : null}
          </span>
        </TooltipContent>
      </Tooltip>
    </div>
  )
}
