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

export type SpeechSegment = { language: SpeechLanguage; text: string }

// A Chinese run starts at a Han character and carries on through CJK punctuation, digits and spaces.
const CHINESE_RUN_RE = /[㐀-鿿豈-﫿][㐀-鿿豈-﫿　-〿＀-￯\d\s]*/g
// Short English inside Chinese ("API", a file name) stays with the Chinese voice.
const MAX_EMBEDDED_ENGLISH_WORDS = 3

/** Splits mixed text into runs, each read by the voice for its language. */
export function speechSegments(text: string): SpeechSegment[] {
  const pieces: SpeechSegment[] = []
  let last = 0
  for (const match of text.matchAll(CHINESE_RUN_RE)) {
    if (match.index > last) {
      pieces.push({ language: 'en', text: text.slice(last, match.index) })
    }
    pieces.push({ language: 'zh', text: match[0] })
    last = match.index + match[0].length
  }
  if (last < text.length) {
    pieces.push({ language: 'en', text: text.slice(last) })
  }
  const merged: SpeechSegment[] = []
  pieces.forEach((piece, index) => {
    const words = piece.text.match(/[A-Za-z0-9][\w.'-]*/g)?.length ?? 0
    const betweenChinese =
      pieces[index - 1]?.language === 'zh' && pieces[index + 1]?.language === 'zh'
    const language =
      piece.language === 'en' &&
      (words === 0 || (betweenChinese && words <= MAX_EMBEDDED_ENGLISH_WORDS))
        ? (merged.at(-1)?.language ?? 'en')
        : piece.language
    const previous = merged.at(-1)
    if (previous && previous.language === language) {
      previous.text += piece.text
    } else {
      merged.push({ language, text: piece.text })
    }
  })
  return merged
    .map((segment) => ({ ...segment, text: segment.text.trim() }))
    .filter((segment) => segment.text.length > 0)
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
  segments: SpeechSegment[]
  voices: Record<SpeechLanguage, string>
  ratePercent: number
}): string {
  const lang = args.segments[0]?.language === 'zh' ? 'zh-CN' : 'en-US'
  const rate = `${args.ratePercent >= 0 ? '+' : ''}${Math.round(args.ratePercent)}%`
  const voices = args.segments
    .map(
      (segment) =>
        `<voice name='${escapeXml(args.voices[segment.language])}'><prosody rate='${rate}'>${escapeXml(segment.text)}</prosody></voice>`
    )
    .join('')
  return `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${lang}'>${voices}</speak>`
}
