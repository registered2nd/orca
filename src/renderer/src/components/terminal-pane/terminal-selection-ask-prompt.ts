// TUI chrome that frames agent output: box borders and rules, not content.
const BOX_CHARS = '│┃║╭╮╰╯┌┐└┘├┤┬┴┼─━═'
const LEADING_BOX = new RegExp(`^\\s*[${BOX_CHARS}]+`)
const TRAILING_BOX = new RegExp(`[${BOX_CHARS}]+\\s*$`)
const ONLY_BOX = new RegExp(`^[\\s${BOX_CHARS}]*$`)
// Agent CLIs mark each reply block with a bullet; it is presentation, not text.
const REPLY_BULLET = /^(\s*)[●⏺] /
const BLOCK_START = /^(\s*)([-*+]|\d+[.)]|#{1,6}|>|\||```)(\s|$)/
const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+/
const WIDE_CHAR =
  /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/
const CJK_EDGE = /[\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\uff00-\uffef]/
const WRAP_SLACK_COLUMNS = 12

function displayWidth(text: string): number {
  let width = 0
  for (const char of text) {
    width += WIDE_CHAR.test(char) ? 2 : 1
  }
  return width
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length
}

function continuationIndent(line: string): number {
  const item = LIST_ITEM.exec(line)
  return item ? item[0].length : indentOf(line)
}

// Why: a TUI hard-wraps prose at its own width, so a row that nearly fills the terminal and runs on is one line.
function isWrappedRow(line: string, next: string, rawWidth: number, columns: number): boolean {
  if (rawWidth < columns - WRAP_SLACK_COLUMNS || !next.trim() || BLOCK_START.test(next)) {
    return false
  }
  if (indentOf(next) !== continuationIndent(line)) {
    return false
  }
  return /[\p{L}\p{N},'"’”)\]]$/u.test(line) || CJK_EDGE.test(line.slice(-1))
}

function joinRows(line: string, next: string): string {
  const rest = next.trimStart()
  const noSpace = CJK_EDGE.test(line.slice(-1)) && CJK_EDGE.test(rest.charAt(0))
  return `${line}${noSpace ? '' : ' '}${rest}`
}

/** Plain text of a terminal selection: no box borders, common indent removed, TUI-wrapped prose rejoined. */
export function cleanTerminalSelection(text: string, columns: number | null): string {
  const rows = text.replace(/\r\n?/g, '\n').split('\n')
  const lines: { text: string; rawWidth: number }[] = []
  for (const row of rows) {
    const rawWidth = displayWidth(row.trimEnd())
    if (ONLY_BOX.test(row)) {
      lines.push({ text: '', rawWidth })
      continue
    }
    const stripped = row
      .replace(LEADING_BOX, (match) => ' '.repeat(match.length))
      .replace(TRAILING_BOX, '')
      .replace(REPLY_BULLET, '$1  ')
      .trimEnd()
    lines.push({ text: stripped, rawWidth })
  }
  const indents = lines.filter((line) => line.text.trim()).map((line) => indentOf(line.text))
  const commonIndent = indents.length > 0 ? Math.min(...indents) : 0
  for (const line of lines) {
    line.text = line.text.slice(commonIndent)
  }

  const joined: string[] = []
  let inFence = false
  for (let index = 0; index < lines.length; index += 1) {
    let current = lines[index].text
    let rawWidth = lines[index].rawWidth
    if (current.trimStart().startsWith('```')) {
      inFence = !inFence
    }
    while (
      !inFence &&
      columns !== null &&
      index + 1 < lines.length &&
      isWrappedRow(current, lines[index + 1].text, rawWidth, columns)
    ) {
      index += 1
      current = joinRows(current, lines[index].text)
      rawWidth = lines[index].rawWidth
    }
    joined.push(current)
  }
  return joined
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+|\n+$/g, '')
}

/** The message an agent receives: the question, then the quoted selection and where it came from. */
export function buildTerminalSelectionAskPrompt(args: {
  question: string
  selection: string
  fromTargetsOwnOutput: boolean
  sourceTitle: string | null
}): string {
  const where = args.fromTargetsOwnOutput
    ? 'About this part of your output, which I selected in the terminal:'
    : `About this text I selected in another terminal${args.sourceTitle ? ` ("${args.sourceTitle}")` : ''}:`
  const quoted = args.selection
    .split('\n')
    .map((line) => (line ? `> ${line}` : '>'))
    .join('\n')
  return [args.question.trim(), where, quoted].join('\n\n')
}
