import { describe, expect, it } from 'vitest'
import type { BrowserGrabPayload } from '../../../../../shared/browser-grab-types'
import { buildAskPrompt, elementText } from './browser-page-ask-prompt'

function payload(overrides: Partial<BrowserGrabPayload['target']> = {}): BrowserGrabPayload {
  return {
    page: {
      sanitizedUrl: 'https://example.com/a',
      title: 'Example',
      viewportWidth: 800,
      viewportHeight: 600,
      scrollX: 0,
      scrollY: 0,
      devicePixelRatio: 1,
      capturedAt: '2026-10-14T00:00:00Z'
    },
    target: {
      tagName: 'P',
      selector: 'p.intro',
      elementPath: 'main > p.intro',
      textSnippet: 'Short',
      htmlSnippet:
        '<p class="intro">Attention lets each token <b>look at</b> the others &amp; mix.</p>',
      attributes: {},
      accessibility: { role: null, accessibleName: null, ariaLabel: null, ariaLabelledBy: null },
      rectViewport: { x: 0, y: 0, width: 1, height: 1 },
      rectPage: { x: 0, y: 0, width: 1, height: 1 },
      computedStyles: {
        display: '',
        position: '',
        width: '',
        height: '',
        margin: '',
        padding: '',
        color: '',
        backgroundColor: '',
        border: '',
        borderRadius: '',
        fontFamily: '',
        fontSize: '',
        fontWeight: '',
        lineHeight: '',
        textAlign: '',
        zIndex: ''
      },
      ...overrides
    },
    nearbyText: [],
    ancestorPath: [],
    screenshot: null
  }
}

describe('elementText', () => {
  it('prefers the longer text recovered from the HTML snippet', () => {
    expect(elementText(payload())).toBe('Attention lets each token look at the others & mix.')
  })
})

describe('buildAskPrompt', () => {
  it('puts the question first, then numbered items: picked element, content, elements, page', () => {
    const prompt = buildAskPrompt({
      question: ' What does this mean? ',
      page: { title: 'Example', url: 'https://example.com/a' },
      items: [
        {
          kind: 'element',
          payload: payload({
            computedStyles: { ...payload().target.computedStyles, display: 'block' }
          })
        },
        { kind: 'text', text: '## Step\n\nsoftmax over scores' },
        { kind: 'elements', text: 'Element <section> at `main > #data`' },
        { kind: 'page', textPath: 'C:/tmp/page.md', text: '' }
      ]
    })
    expect(prompt).toBe(
      [
        'What does this mean?',
        `About the web page I'm looking at in Orca: "Example" (https://example.com/a).`,
        '1. Element <p> at `main > p.intro` (1 x 1 px)\nStyles: display: block\nMarkup:\n```html\n<p class="intro">Attention lets each token <b>look at</b> the others &amp; mix.</p>\n```',
        '2. Highlighted on the page:\n\n## Step\n\nsoftmax over scores',
        '3. Elements my highlight covers:\n\nElement <section> at `main > #data`',
        "4. The whole page's text, saved at: C:/tmp/page.md"
      ].join('\n\n')
    )
  })

  it('sends the question alone when there is nothing to attach', () => {
    expect(buildAskPrompt({ question: 'And why?', page: { title: '', url: '' }, items: [] })).toBe(
      'And why?'
    )
  })
})
