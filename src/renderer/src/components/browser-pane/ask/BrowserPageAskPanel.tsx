import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Crosshair, FileText, Highlighter, Send, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { translate } from '@/i18n/i18n'
import { activeAgentNotesSendFailureMessage } from '@/lib/active-agent-note-send-result'
import { sendMessageToAgent } from '@/lib/agent-message-send'
import { ImeTextarea } from '@/lib/ime-text-field'
import {
  getLastFocusedAgentPane,
  subscribeLastFocusedAgentPane
} from '@/lib/last-focused-agent-pane'
import { useAppStore } from '@/store'
import { parsePaneKey } from '../../../../../shared/stable-pane-id'
import type { GrabModeHook } from '../annotate/useGrabMode'
import {
  addAskItem,
  clearAskBasket,
  createAskItemId,
  getAskBasket,
  removeAskItem,
  subscribeAskBasket,
  type BrowserAskItem
} from './browser-page-ask-basket'
import { buildAskPrompt } from './browser-page-ask-prompt'
import {
  chipLabel,
  collectSendItems,
  loadAskMode,
  readHighlight,
  readWholePage,
  saveAskMode,
  toPromptItem,
  type AskMode
} from './browser-page-ask-send'

export function BrowserPageAskPanel({
  browserPageId,
  page,
  grab,
  onClose
}: {
  browserPageId: string
  page: { title: string; url: string }
  grab: GrabModeHook
  onClose: () => void
}): React.JSX.Element {
  const items = useSyncExternalStore(subscribeAskBasket, () => getAskBasket(browserPageId))
  const target = useSyncExternalStore(subscribeLastFocusedAgentPane, getLastFocusedAgentPane)
  const targetTitle = useAppStore((s) => {
    const entry = target ? s.agentStatusByPaneKey[target.paneKey] : undefined
    return entry?.terminalTitle || entry?.agentType || null
  })
  const [question, setQuestion] = useState('')
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [mode, setMode] = useState<AskMode>(loadAskMode)
  const picking = grab.state !== 'idle' && grab.state !== 'error'
  const grabRef = useRef(grab)
  grabRef.current = grab

  // Content never picks; leaving Elements disarms the picker so text can be highlighted.
  useEffect(() => {
    if (mode === 'content') {
      grabRef.current.cancel()
    }
  }, [mode])

  // Each pick joins the basket and the picker re-arms for the next one.
  useEffect(() => {
    if (grab.state === 'confirming' && grab.payload) {
      addAskItem(browserPageId, { id: createAskItemId(), kind: 'element', payload: grab.payload })
      grab.rearm()
    }
  }, [browserPageId, grab, grab.state, grab.payload])

  const changeMode = (next: string): void => {
    if (next !== 'content' && next !== 'elements') {
      return
    }
    setMode(next)
    saveAskMode(next)
    setNotice(null)
  }

  const keep = async (read: () => Promise<BrowserAskItem | null>): Promise<void> => {
    const item = await read()
    if (!item) {
      setNotice(
        translate(
          'auto.components.browser.pane.ask.nothingHighlighted',
          'Highlight something on the page first.'
        )
      )
      return
    }
    setNotice(null)
    addAskItem(browserPageId, item)
  }

  const send = async (): Promise<void> => {
    const pane = target ? parsePaneKey(target.paneKey) : null
    if (!target || !pane || !question.trim()) {
      return
    }
    setSending(true)
    try {
      const askItems = await collectSendItems(browserPageId, mode, items)
      const promptItems = await Promise.all(askItems.map(toPromptItem))
      const result = await sendMessageToAgent({
        worktreeId: target.worktreeId,
        target: { kind: 'terminal', tabId: pane.tabId, leafId: pane.leafId },
        prompt: buildAskPrompt({ question, page, items: promptItems })
      })
      if (result.status === 'sent') {
        clearAskBasket(browserPageId)
        setQuestion('')
        setNotice(translate('auto.components.browser.pane.ask.sent', 'Sent.'))
      } else {
        setNotice(
          activeAgentNotesSendFailureMessage(result.status, {
            explicitTarget: true,
            code: result.code
          })
        )
      }
    } finally {
      setSending(false)
    }
  }

  const placeholder =
    items.length > 0
      ? translate(
          'auto.components.browser.pane.ask.placeholder',
          'Ask about what you kept… (Enter to send)'
        )
      : mode === 'content'
        ? translate(
            'auto.components.browser.pane.ask.placeholderContent',
            'Highlight text, then ask… (Enter sends the highlight, or the whole page)'
          )
        : translate(
            'auto.components.browser.pane.ask.placeholderElements',
            'Highlight across blocks or Pick them, then ask… (Enter to send)'
          )

  return (
    <div
      data-testid="browser-ask-panel"
      className="absolute bottom-3 left-1/2 z-20 flex w-[min(36rem,calc(100%-1.5rem))] -translate-x-1/2 flex-col gap-2 rounded-xl border border-border bg-popover/95 p-2 text-sm text-popover-foreground shadow-floating backdrop-blur"
    >
      <div className="flex items-center gap-1">
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={mode}
          onValueChange={changeMode}
        >
          <ToggleGroupItem value="content">
            {translate('auto.components.browser.pane.ask.modeContent', 'Content')}
          </ToggleGroupItem>
          <ToggleGroupItem value="elements">
            {translate('auto.components.browser.pane.ask.modeElements', 'Elements')}
          </ToggleGroupItem>
        </ToggleGroup>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void keep(() => readHighlight(browserPageId, mode))}
          title={translate(
            'auto.components.browser.pane.ask.keepTitle',
            'Keep this highlight and highlight another'
          )}
        >
          <Highlighter className="size-3.5" />
          {translate('auto.components.browser.pane.ask.keep', 'Keep highlight')}
        </Button>
        {mode === 'elements' ? (
          <Button
            size="sm"
            variant={picking ? 'default' : 'ghost'}
            onClick={grab.toggle}
            title={translate(
              'auto.components.browser.pane.ask.pickTitle',
              'Click blocks to add them; turn off to highlight'
            )}
          >
            <Crosshair className="size-3.5" />
            {translate('auto.components.browser.pane.ask.pick', 'Pick')}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void keep(() => readWholePage(browserPageId))}
          >
            <FileText className="size-3.5" />
            {translate('auto.components.browser.pane.ask.addPage', 'Whole page')}
          </Button>
        )}
        <span className="min-w-0 flex-1" />
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label={translate('auto.components.browser.pane.ask.close', 'Close Ask')}
          onClick={onClose}
        >
          <X className="size-3.5" />
        </Button>
      </div>
      {items.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {items.map((item) => (
            <span
              key={item.id}
              className="flex max-w-full items-center gap-1 rounded-md border border-border bg-muted/40 py-0.5 pr-0.5 pl-2 text-xs"
            >
              <span className="truncate">{chipLabel(item)}</span>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={translate('auto.components.browser.pane.ask.remove', 'Remove')}
                onClick={() => removeAskItem(browserPageId, item.id)}
              >
                <X className="size-3" />
              </Button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="flex items-end gap-2">
        <ImeTextarea
          className="min-h-9 flex-1 resize-none rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
          rows={2}
          value={question}
          placeholder={placeholder}
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
          aria-label={translate('auto.components.browser.pane.ask.send', 'Send question')}
          disabled={sending || !target || !question.trim()}
          onClick={() => void send()}
        >
          <Send className="size-4" />
        </Button>
      </div>
      <p className="truncate px-1 text-xs text-muted-foreground">
        {notice ??
          (target
            ? translate('auto.components.browser.pane.ask.askingAgent', 'Asking {{value0}}', {
                value0:
                  targetTitle ?? translate('auto.components.browser.pane.ask.agent', 'the agent')
              })
            : translate(
                'auto.components.browser.pane.ask.noAgent',
                'Click into an agent terminal first; questions go to the agent you last used.'
              ))}
      </p>
    </div>
  )
}
