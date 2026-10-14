// Turns an agent's markdown reply into text worth hearing, split into chunks that
// start playing quickly. Shared so main (synthesis) and renderer (scheduling) agree.

const CJK_RE = /[㐀-鿿豈-﫿]/g
const LATIN_RE = /[A-Za-z]/g

export type SpeechLanguage = 'en' | 'zh'

export function speechLanguageOf(text: string): SpeechLanguage {
  const cjk = text.match(CJK_RE)?.length ?? 0
  const latin = text.match(LATIN_RE)?.length ?? 0
  return cjk > latin / 2 ? 'zh' : 'en'
}

function speakableInlineCode(code: string): string {
  // Paths read aloud are noise; the file name carries the meaning.
  const named = /[/\\]/.test(code)
    ? (code
        .replace(/[/\\]+$/, '')
        .split(/[/\\]/)
        .pop() ?? '')
    : code
  return named.length <= 40 ? named : ' '
}

export function replyTextForSpeech(markdown: string): string {
  let text = markdown.replace(/```[\s\S]*?```/g, ' ')
  text = text
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('|'))
    .join('\n')
  text = text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<?https?:\/\/[^\s>)]+>?/g, ' ')
    .replace(/`([^`]*)`/g, (_match, code: string) => speakableInlineCode(code))
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, '')
    .replace(/(\*\*|__|~~)(?=\S)([\s\S]+?)(?<=\S)\1/g, '$2')
    .replace(/(^|[^\w*])\*(?=\S)([^*\n]+?)(?<=\S)\*/g, '$1$2')
    .replace(/^\s*[-*_]{3,}\s*$/gm, '')
    .replace(/→/g, ' to ')
    .replace(/[—]/g, ', ')
    .replace(/[ \t]+/g, ' ')
  return text.replace(/\n{2,}/g, '\n').trim()
}

/** Short first chunk so speech starts fast; later chunks larger for fewer round trips. */
export function speechChunks(text: string, firstLimit = 160, restLimit = 420): string[] {
  const sentences = text
    .split(/(?<=[.!?])\s+|(?<=[。！？])|\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  const chunks: string[] = []
  let current = ''
  let limit = firstLimit
  for (const sentence of sentences) {
    if (current && current.length + sentence.length > limit) {
      chunks.push(current)
      current = ''
      limit = restLimit
    }
    current = current ? `${current} ${sentence}` : sentence
  }
  if (current) {
    chunks.push(current)
  }
  return chunks
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function buildSpeechSsml(args: {
  text: string
  voice: string
  language: SpeechLanguage
  ratePercent: number
}): string {
  const lang = args.language === 'zh' ? 'zh-CN' : 'en-US'
  const rate = `${args.ratePercent >= 0 ? '+' : ''}${Math.round(args.ratePercent)}%`
  return (
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${lang}'>` +
    `<voice name='${escapeXml(args.voice)}'><prosody rate='${rate}'>${escapeXml(args.text)}</prosody></voice></speak>`
  )
}
