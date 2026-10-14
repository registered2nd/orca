import type { BrowserGrabPayload } from '../../../../../shared/browser-grab-types'

const ELEMENT_TEXT_MAX_CHARS = 1500
const FENCE = '```'

export type AskPromptItem =
  | { kind: 'element'; payload: BrowserGrabPayload }
  | { kind: 'text'; text: string }
  | { kind: 'elements'; text: string }
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

function describeElement(payload: BrowserGrabPayload): string {
  const { target } = payload
  const name = target.accessibility.accessibleName?.trim()
  const { width, height } = target.rectPage
  const styles = Object.entries(target.computedStyles)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: ${value}`)
    .join('; ')
  const lines = [
    `Element <${target.tagName.toLowerCase()}>${name ? ` "${name}"` : ''} at \`${target.elementPath ?? target.selector}\` (${Math.round(width)} x ${Math.round(height)} px)`
  ]
  if (styles) {
    lines.push(`Styles: ${styles}`)
  }
  if (target.htmlSnippet) {
    lines.push(`Markup:\n${FENCE}html\n${target.htmlSnippet}\n${FENCE}`)
  }
  return lines.join('\n')
}

function describeItem(item: AskPromptItem): string {
  switch (item.kind) {
    case 'element':
      return describeElement(item.payload)
    case 'text':
      return `Highlighted on the page:\n\n${item.text.trim()}`
    case 'elements':
      return `Elements my highlight covers:\n\n${item.text.trim()}`
    case 'page':
      return item.textPath
        ? `The whole page's text, saved at: ${item.textPath}`
        : `The whole page's text:\n\n${item.text.trim()}`
  }
}

/** The message an agent receives: the question first, then what the user pointed at. */
export function buildAskPrompt(args: {
  question: string
  page: { title: string; url: string }
  items: readonly AskPromptItem[]
}): string {
  const parts = [args.question.trim()]
  if (args.items.length > 0) {
    parts.push(
      `About the web page I'm looking at in Orca: "${args.page.title}" (${args.page.url}).`
    )
    args.items.forEach((item, index) => parts.push(`${index + 1}. ${describeItem(item)}`))
  }
  return parts.join('\n\n')
}
