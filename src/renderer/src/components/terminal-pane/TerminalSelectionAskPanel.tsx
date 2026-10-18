import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Send, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { activeAgentNotesSendFailureMessage } from '@/lib/active-agent-note-send-result'
import { sendMessageToAgent } from '@/lib/agent-message-send'
import { ImeTextarea } from '@/lib/ime-text-field'
import {
  getLastFocusedAgentPane,
  subscribeLastFocusedAgentPane
} from '@/lib/last-focused-agent-pane'
import { useAppStore } from '@/store'
import { makePaneKey, parsePaneKey } from '../../../../shared/stable-pane-id'
import {
  buildTerminalSelectionAskPrompt,
  cleanTerminalSelection
} from './terminal-selection-ask-prompt'

export type TerminalSelectionAsk = {
  paneId: number
  leafId: string
  text: string
  columns: number | null
}

export function TerminalSelectionAskPanel({
  tabId,
  worktreeId,
  ask,
  onClose
}: {
  tabId: string
  worktreeId: string
  ask: TerminalSelectionAsk
  onClose: () => void
}): React.JSX.Element {
  const selection = useMemo(() => cleanTerminalSelection(ask.text, ask.columns), [ask])
  const sourcePaneKey = makePaneKey(tabId, ask.leafId)
  const sourceIsAgent = useAppStore((s) =>
    Boolean(s.agentStatusByPaneKey[sourcePaneKey] || s.retainedAgentsByPaneKey[sourcePaneKey])
  )
  const lastFocused = useSyncExternalStore(subscribeLastFocusedAgentPane, getLastFocusedAgentPane)
  // Why: text selected in an agent's own output is a question for that agent; a plain shell's goes to the last agent used.
  const target = sourceIsAgent ? { paneKey: sourcePaneKey, worktreeId } : lastFocused
  const targetTitle = useAppStore((s) => {
    const entry = target ? s.agentStatusByPaneKey[target.paneKey] : undefined
    return entry?.terminalTitle || entry?.agentType || null
  })
  const sourceTitle = useAppStore(
    (s) => (s.tabsByWorktree[worktreeId] ?? []).find((tab) => tab.id === tabId)?.title ?? null
  )
  const [question, setQuestion] = useState('')
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const send = async (): Promise<void> => {
    const pane = target ? parsePaneKey(target.paneKey) : null
    if (!target || !pane || !question.trim() || sending) {
      return
    }
    setSending(true)
    try {
      const result = await sendMessageToAgent({
        worktreeId: target.worktreeId,
        target: { kind: 'terminal', tabId: pane.tabId, leafId: pane.leafId },
        prompt: buildTerminalSelectionAskPrompt({
          question,
          selection,
          fromTargetsOwnOutput: target.paneKey === sourcePaneKey,
          sourceTitle
        })
      })
      if (result.status === 'sent') {
        onClose()
        return
      }
      setNotice(
        activeAgentNotesSendFailureMessage(result.status, {
          explicitTarget: true,
          code: result.code
        })
      )
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      data-testid="terminal-selection-ask-panel"
      className="absolute bottom-3 left-1/2 z-50 flex w-[min(36rem,calc(100%-1.5rem))] -translate-x-1/2 flex-col gap-2 rounded-xl border border-border bg-popover/95 p-2 text-sm text-popover-foreground shadow-floating backdrop-blur"
      // Why: keys typed here are the question, not terminal shortcuts or PTY input.
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === 'Escape') {
          event.preventDefault()
          onClose()
        }
      }}
    >
      <div className="flex items-start gap-2">
        <p className="line-clamp-4 min-w-0 flex-1 rounded-md border border-border bg-muted/40 px-2 py-1 font-mono text-xs whitespace-pre-wrap text-muted-foreground">
          {selection}
        </p>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label={translate('auto.components.terminal.pane.ask.close', 'Close Ask')}
          onClick={onClose}
        >
          <X className="size-3.5" />
        </Button>
      </div>
      <div className="flex items-end gap-2">
        <ImeTextarea
          ref={inputRef}
          className="min-h-9 flex-1 resize-none rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
          rows={2}
          value={question}
          placeholder={translate(
            'auto.components.terminal.pane.ask.placeholder',
            'Ask about the selection… (Enter to send)'
          )}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void send()
            }
          }}
        />
        <Button
          size="icon"
          aria-label={translate('auto.components.terminal.pane.ask.send', 'Send question')}
          disabled={sending || !target || !question.trim()}
          onClick={() => void send()}
        >
          <Send className="size-4" />
        </Button>
      </div>
      <p className="truncate px-1 text-xs text-muted-foreground">
        {notice ??
          (target
            ? translate('auto.components.terminal.pane.ask.askingAgent', 'Asking {{value0}}', {
                value0:
                  targetTitle ?? translate('auto.components.terminal.pane.ask.agent', 'the agent')
              })
            : translate(
                'auto.components.terminal.pane.ask.noAgent',
                'Click into an agent terminal first; questions go to the agent you last used.'
              ))}
      </p>
    </div>
  )
}
