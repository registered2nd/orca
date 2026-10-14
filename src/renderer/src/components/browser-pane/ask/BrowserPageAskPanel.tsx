import { useEffect, useState, useSyncExternalStore } from 'react'
import { Crosshair, FileText, Send, TextSelect, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { activeAgentNotesSendFailureMessage } from '@/lib/active-agent-note-send-result'
import { sendMessageToAgent } from '@/lib/agent-message-send'
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
import { buildAskPrompt, elementText, type AskPromptItem } from './browser-page-ask-prompt'

function chipLabel(item: BrowserAskItem): string {
  if (item.kind === 'page') {
    return translate('auto.components.browser.pane.ask.wholePage', 'Whole page')
  }
  const text = item.kind === 'text' ? item.text : elementText(item.payload)
  const label = text.replace(/\s+/g, ' ').trim()
  const prefix = item.kind === 'element' ? `<${item.payload.target.tagName.toLowerCase()}> ` : ''
  return `${prefix}${label.length > 40 ? `${label.slice(0, 40)}…` : label || '…'}`
}

async function toPromptItem(item: BrowserAskItem): Promise<AskPromptItem> {
  if (item.kind === 'element') {
    const dataUrl = item.payload.screenshot?.dataUrl
    const screenshotPath = dataUrl
      ? await window.api.browser.askSaveAttachment({ kind: 'png', dataUrl }).catch(() => null)
      : null
    return { kind: 'element', payload: item.payload, screenshotPath }
  }
  if (item.kind === 'page') {
    const textPath = await window.api.browser
      .askSaveAttachment({ kind: 'text', text: item.text })
      .catch(() => null)
    return { kind: 'page', textPath, text: item.text }
  }
  return item
}

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
  const picking = grab.state !== 'idle' && grab.state !== 'error'

  // Each pick joins the basket and the picker re-arms for the next one.
  useEffect(() => {
    if (grab.state === 'confirming' && grab.payload) {
      addAskItem(browserPageId, { id: createAskItemId(), kind: 'element', payload: grab.payload })
      grab.rearm()
    }
  }, [browserPageId, grab, grab.state, grab.payload])

  const addFromPage = async (what: 'selection' | 'page'): Promise<void> => {
    const result = await window.api.browser.askReadPage({ browserPageId, what })
    if (!result.ok || !result.text.trim()) {
      setNotice(
        what === 'selection'
          ? translate(
              'auto.components.browser.pane.ask.noSelection',
              'Select some text on the page first (turn picking off to select).'
            )
          : translate('auto.components.browser.pane.ask.noPageText', 'Could not read the page.')
      )
      return
    }
    setNotice(null)
    addAskItem(browserPageId, {
      id: createAskItemId(),
      kind: what === 'page' ? 'page' : 'text',
      text: result.text
    })
  }

  const send = async (): Promise<void> => {
    const pane = target ? parsePaneKey(target.paneKey) : null
    if (!target || !pane || !question.trim()) {
      return
    }
    setSending(true)
    try {
      const promptItems = await Promise.all(items.map(toPromptItem))
      const result = await sendMessageToAgent({
        worktreeId: target.worktreeId,
        target: { kind: 'terminal', tabId: pane.tabId, leafId: pane.leafId },
        prompt: buildAskPrompt({ question, page, items: promptItems })
      })
      if (result.status === 'sent') {
        clearAskBasket(browserPageId)
        setQuestion('')
        setNotice(
          translate(
            'auto.components.browser.pane.ask.sent',
            'Sent. Keep picking to ask a follow-up.'
          )
        )
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

  return (
    <div
      data-testid="browser-ask-panel"
      className="absolute bottom-3 left-1/2 z-20 flex w-[min(36rem,calc(100%-1.5rem))] -translate-x-1/2 flex-col gap-2 rounded-xl border border-border bg-popover/95 p-2 text-sm text-popover-foreground shadow-floating backdrop-blur"
    >
      <div className="flex items-center gap-1">
        <span className="min-w-0 flex-1 truncate px-1 text-xs text-muted-foreground">
          {target
            ? translate('auto.components.browser.pane.ask.askingAgent', 'Asking {{value0}}', {
                value0:
                  targetTitle ?? translate('auto.components.browser.pane.ask.agent', 'the agent')
              })
            : translate(
                'auto.components.browser.pane.ask.noAgent',
                'Click into an agent terminal first; questions go to the agent you last used.'
              )}
        </span>
        <Button
          size="sm"
          variant={picking ? 'default' : 'ghost'}
          onClick={grab.toggle}
          title={translate(
            'auto.components.browser.pane.ask.pickTitle',
            'Click page elements to add them'
          )}
        >
          <Crosshair className="size-3.5" />
          {translate('auto.components.browser.pane.ask.pick', 'Pick')}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void addFromPage('selection')}>
          <TextSelect className="size-3.5" />
          {translate('auto.components.browser.pane.ask.addSelection', 'Selection')}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void addFromPage('page')}>
          <FileText className="size-3.5" />
          {translate('auto.components.browser.pane.ask.addPage', 'Whole page')}
        </Button>
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
        <textarea
          className="min-h-9 flex-1 resize-none rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
          rows={2}
          value={question}
          placeholder={translate(
            'auto.components.browser.pane.ask.placeholder',
            'Ask about what you picked… (Enter to send)'
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
          aria-label={translate('auto.components.browser.pane.ask.send', 'Send question')}
          disabled={sending || !target || !question.trim()}
          onClick={() => void send()}
        >
          <Send className="size-4" />
        </Button>
      </div>
      {notice ? <p className="px-1 text-xs text-muted-foreground">{notice}</p> : null}
    </div>
  )
}
