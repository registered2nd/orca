import type { BrowserAskReadPageArgs } from '../../shared/browser-grab-types'

const PAGE_TEXT_MAX_CHARS = 200_000
const ELEMENT_MARKUP_MAX_CHARS = 4000
const MAX_HIGHLIGHTED_ELEMENTS = 20

// Why: these run inside the guest page via executeJavaScript, so they are plain JS source, not compiled TS.

/** The highlighted range as Markdown: everything inside it (code, tables, images, links) read as content. */
const SELECTION_CONTENT_SCRIPT = `(() => {
  const sel = window.getSelection ? window.getSelection() : null
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return ''
  const BLOCK = /^(P|DIV|SECTION|ARTICLE|HEADER|FOOTER|MAIN|ASIDE|NAV|UL|OL|TABLE|THEAD|TBODY|BLOCKQUOTE|FIGURE|FIGCAPTION|DL|DT|DD|FORM|DETAILS|SUMMARY)$/
  const isBlock = (tag) => tag === 'P' || tag === 'PRE' || tag === 'LI' || tag === 'TR' || tag === 'HR' || /^H[1-6]$/.test(tag) || BLOCK.test(tag)
  const walk = (node) => {
    if (node.nodeType === 3) {
      const text = node.textContent.replace(/\\s+/g, ' ')
      const besideBlock = [node.previousSibling, node.nextSibling].some((n) => n && n.nodeType === 1 && isBlock(n.tagName.toUpperCase()))
      return text === ' ' && besideBlock ? '' : text
    }
    if (node.nodeType !== 1 && node.nodeType !== 11) return ''
    const tag = node.nodeType === 1 ? node.tagName.toUpperCase() : ''
    if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(tag)) return ''
    if (tag === 'BR') return '\\n'
    if (tag === 'HR') return '\\n\\n---\\n\\n'
    if (tag === 'IMG') return '![' + (node.getAttribute('alt') || '') + '](' + (node.src || node.getAttribute('src') || '') + ')'
    if (tag === 'PRE') return '\\n\\n\\u0060\\u0060\\u0060\\n' + node.textContent.replace(/\\n$/, '') + '\\n\\u0060\\u0060\\u0060\\n\\n'
    if (tag === 'SVG') {
      const title = node.getAttribute('aria-label') || (node.querySelector('title') || {}).textContent
      return title ? '[figure: ' + title + ']' : '[figure]'
    }
    if (tag === 'CANVAS') return '[canvas]'
    if (/^(VIDEO|AUDIO|IFRAME)$/.test(tag)) return '[' + tag.toLowerCase() + (node.src ? ': ' + node.src : '') + ']'
    if (tag === 'TR') return '\\n| ' + Array.from(node.children).map((cell) => walk(cell).trim()).join(' | ') + ' |'
    const inner = Array.from(node.childNodes).map(walk).join('')
    if (tag === 'CODE') return '\\u0060' + inner.trim() + '\\u0060'
    const href = tag === 'A' ? node.getAttribute('href') : null
    if (href && !href.startsWith('#') && inner.trim()) return '[' + inner.trim() + '](' + node.href + ')'
    if (/^H[1-6]$/.test(tag)) return '\\n\\n' + '#'.repeat(Number(tag[1])) + ' ' + inner.trim() + '\\n\\n'
    if (tag === 'LI') return '\\n- ' + inner.trim() + '\\n'
    if (tag === 'P' || BLOCK.test(tag)) return '\\n\\n' + inner.trim() + '\\n\\n'
    return inner
  }
  const parts = []
  for (let i = 0; i < sel.rangeCount; i++) parts.push(walk(sel.getRangeAt(i).cloneContents()))
  return parts.join('\\n\\n').replace(/\\n[ \\t]+(?=\\n)/g, '\\n').replace(/\\n{3,}/g, '\\n\\n').trim().slice(0, ${PAGE_TEXT_MAX_CHARS})
})()`

/** The elements the highlight spans, described for design questions: tag, path, size, styles, markup. */
const SELECTION_ELEMENTS_SCRIPT = `(() => {
  const sel = window.getSelection ? window.getSelection() : null
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return ''
  const range = sel.getRangeAt(0)
  let root = range.commonAncestorContainer
  if (root.nodeType !== 1) root = root.parentElement
  if (!root) return ''
  let picked = Array.from(root.children).filter((el) => range.intersectsNode(el))
  if (picked.length === 0) picked = [root]
  const pathOf = (el) => {
    const parts = []
    for (let e = el; e && e.nodeType === 1 && e !== document.body && parts.length < 5; e = e.parentElement) {
      let part = e.tagName.toLowerCase()
      if (e.id) { parts.unshift(part + '#' + e.id); break }
      const classes = Array.from(e.classList).slice(0, 2)
      if (classes.length) part += '.' + classes.join('.')
      parts.unshift(part)
    }
    return parts.join(' > ')
  }
  const STYLE_KEYS = ['display', 'position', 'width', 'height', 'margin', 'padding', 'color', 'background-color', 'border', 'border-radius', 'font-family', 'font-size', 'font-weight', 'line-height']
  return picked.slice(0, ${MAX_HIGHLIGHTED_ELEMENTS}).map((el) => {
    const computed = getComputedStyle(el)
    const styles = STYLE_KEYS.map((key) => [key, computed.getPropertyValue(key)]).filter(([, value]) => value).map(([key, value]) => key + ': ' + value).join('; ')
    const rect = el.getBoundingClientRect()
    const html = el.outerHTML.length > ${ELEMENT_MARKUP_MAX_CHARS} ? el.outerHTML.slice(0, ${ELEMENT_MARKUP_MAX_CHARS}) + '…' : el.outerHTML
    return 'Element <' + el.tagName.toLowerCase() + '> at \\u0060' + pathOf(el) + '\\u0060 (' + Math.round(rect.width) + ' x ' + Math.round(rect.height) + ' px)' +
      (styles ? '\\nStyles: ' + styles : '') + '\\nMarkup:\\n\\u0060\\u0060\\u0060html\\n' + html + '\\n\\u0060\\u0060\\u0060'
  }).join('\\n\\n')
})()`

const PAGE_TEXT_SCRIPT = `(document.body ? document.body.innerText : '').slice(0, ${PAGE_TEXT_MAX_CHARS})`

export function askReadPageScript(what: BrowserAskReadPageArgs['what']): string {
  const text =
    what === 'selection'
      ? SELECTION_CONTENT_SCRIPT
      : what === 'selection-elements'
        ? SELECTION_ELEMENTS_SCRIPT
        : PAGE_TEXT_SCRIPT
  return `({ text: ${text}, title: document.title, url: location.href })`
}
