import type { BrowserGrabPayload } from '../../../../../shared/browser-grab-types'

const ELEMENT_TEXT_MAX_CHARS = 1500

export type AskPromptItem =
  | { kind: 'element'; payload: BrowserGrabPayload; screenshotPath: string | null }
  | { kind: 'text'; text: string }
  | { kind: 'page'; textPath: string | null; text: string }

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

/** Readable text of a picked element: its HTML snippet holds more than the 200-char text snippet. */
export function elementText(payload: BrowserGrabPayload): string {
  const fromHtml = decodeEntities(
    payload.target.htmlSnippet
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim()
  const text =
    fromHtml.length > payload.target.textSnippet.length ? fromHtml : payload.target.textSnippet
  return text.length > ELEMENT_TEXT_MAX_CHARS ? `${text.slice(0, ELEMENT_TEXT_MAX_CHARS)}…` : text
}

function quote(text: string): string {
  return text
    .trim()
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n')
}

function describeElement(payload: BrowserGrabPayload, screenshotPath: string | null): string {
  const { target } = payload
  const name = target.accessibility.accessibleName?.trim()
  const lines = [
    `Element <${target.tagName.toLowerCase()}>${name ? ` "${name}"` : ''} at \`${target.elementPath ?? target.selector}\``
  ]
  if (target.selectedText?.trim()) {
    lines.push(`Selected text:\n${quote(target.selectedText)}`)
  }
  const text = elementText(payload)
  if (text) {
    lines.push(`Text:\n${quote(text)}`)
  }
  if (screenshotPath) {
    lines.push(`Screenshot: ${screenshotPath}`)
  }
  return lines.join('\n')
}

/** The message an agent receives: the question first, then what the user pointed at. */
export function buildAskPrompt(args: {
  question: string
  page: { title: string; url: string }
  items: AskPromptItem[]
}): string {
  const parts = [args.question.trim()]
  if (args.items.length > 0) {
    parts.push(
      `About the web page I'm looking at in Orca: "${args.page.title}" (${args.page.url}). I picked:`
    )
    args.items.forEach((item, index) => {
      const body =
        item.kind === 'element'
          ? describeElement(item.payload, item.screenshotPath)
          : item.kind === 'text'
            ? `Selected text:\n${quote(item.text)}`
            : item.textPath
              ? `The whole page's text, saved at: ${item.textPath}`
              : `The whole page's text:\n${quote(item.text)}`
      parts.push(`${index + 1}. ${body}`)
    })
    if (args.items.some((item) => item.kind === 'element' && item.screenshotPath)) {
      parts.push('Open the screenshot files to see what I see.')
    }
  }
  return parts.join('\n\n')
}
