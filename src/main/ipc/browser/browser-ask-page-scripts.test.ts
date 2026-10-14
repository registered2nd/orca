// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest'
import { askReadPageScript } from './browser-ask-page-scripts'

function run(what: 'selection' | 'selection-elements' | 'page'): string {
  // Evaluates the page script the way the guest page does.
  const result: unknown = new Function(`return ${askReadPageScript(what)}`)()
  const text = typeof result === 'object' && result ? Reflect.get(result, 'text') : null
  return typeof text === 'string' ? text : ''
}

function highlight(start: Node, end: Node): void {
  const range = document.createRange()
  range.setStartBefore(start)
  range.setEndAfter(end)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

afterEach(() => {
  window.getSelection()?.removeAllRanges()
  document.body.innerHTML = ''
})

describe('askReadPageScript', () => {
  it('reads a highlight as content, keeping headings, code, images and links', () => {
    document.body.innerHTML = `<main>
      <h2 id="h">The data is just text</h2>
      <p>Each step takes <code>64</code> windows. See <a href="https://example.com/x">the run</a>.</p>
      <pre>x = y[1:]
print(x)</pre>
      <img id="i" alt="loss curve" src="https://example.com/loss.png">
    </main>`
    highlight(document.getElementById('h')!, document.getElementById('i')!)
    expect(run('selection')).toBe(
      [
        '## The data is just text',
        'Each step takes `64` windows. See [the run](https://example.com/x).',
        '```\nx = y[1:]\nprint(x)\n```',
        '![loss curve](https://example.com/loss.png)'
      ].join('\n\n')
    )
  })

  it('reads a highlight as the elements it covers, with path and markup', () => {
    document.body.innerHTML = `<main id="m"><section class="card"><p id="a">One</p></section><section class="card"><p id="b">Two</p></section></main>`
    highlight(document.getElementById('a')!, document.getElementById('b')!)
    const text = run('selection-elements')
    expect(text).toContain('Element <section> at `main#m > section.card`')
    expect(text).toContain('```html\n<section class="card"><p id="b">Two</p></section>\n```')
    expect(text.match(/Element <section>/g)).toHaveLength(2)
  })

  it('returns nothing when nothing is highlighted', () => {
    document.body.innerHTML = '<p>text</p>'
    expect(run('selection')).toBe('')
    expect(run('selection-elements')).toBe('')
  })
})
