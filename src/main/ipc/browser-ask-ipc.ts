import { randomUUID } from 'node:crypto'
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ipcMain } from 'electron'
import { browserManager } from '../browser/browser-manager'
import { isTrustedBrowserRenderer } from './browser-renderer-trust'
import type {
  BrowserAskReadPageArgs,
  BrowserAskReadPageResult,
  BrowserAskSaveAttachmentArgs
} from '../../shared/browser-grab-types'

const PAGE_TEXT_MAX_CHARS = 200_000
const ATTACHMENT_MAX_AGE_MS = 24 * 60 * 60 * 1000
const PNG_DATA_URL_PREFIX = 'data:image/png;base64,'

function askAttachmentDir(): string {
  return join(tmpdir(), 'orca-ask')
}

// Why: one folder reused by every send; files older than a day are dropped as new ones arrive.
function pruneOldAttachments(dir: string): void {
  const cutoff = Date.now() - ATTACHMENT_MAX_AGE_MS
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    try {
      if (statSync(path).mtimeMs < cutoff) {
        rmSync(path, { force: true })
      }
    } catch {
      // Removed concurrently; nothing to do.
    }
  }
}

function readPageScript(what: BrowserAskReadPageArgs['what']): string {
  const text =
    what === 'selection'
      ? 'String(window.getSelection ? window.getSelection() : "")'
      : '(document.body ? document.body.innerText : "")'
  return `({ text: ${text}.slice(0, ${PAGE_TEXT_MAX_CHARS}), title: document.title, url: location.href })`
}

export function registerBrowserAskHandlers(): void {
  ipcMain.removeHandler('browser:askReadPage')
  ipcMain.removeHandler('browser:askSaveAttachment')

  ipcMain.handle(
    'browser:askReadPage',
    async (event, args: BrowserAskReadPageArgs): Promise<BrowserAskReadPageResult> => {
      if (!isTrustedBrowserRenderer(event.sender)) {
        return { ok: false, reason: 'Not authorized' }
      }
      const guest = browserManager.getAuthorizedGuest(args.browserPageId, event.sender.id)
      if (!guest) {
        return { ok: false, reason: 'Page not ready' }
      }
      try {
        const result: unknown = await guest.executeJavaScript(readPageScript(args.what), false)
        const text = typeof result === 'object' && result ? Reflect.get(result, 'text') : null
        const title = typeof result === 'object' && result ? Reflect.get(result, 'title') : null
        const url = typeof result === 'object' && result ? Reflect.get(result, 'url') : null
        return {
          ok: true,
          text: typeof text === 'string' ? text : '',
          title: typeof title === 'string' ? title : '',
          url: typeof url === 'string' ? url : ''
        }
      } catch (error) {
        return { ok: false, reason: String(error) }
      }
    }
  )

  ipcMain.handle(
    'browser:askSaveAttachment',
    (event, args: BrowserAskSaveAttachmentArgs): string | null => {
      if (!isTrustedBrowserRenderer(event.sender)) {
        return null
      }
      const dir = askAttachmentDir()
      mkdirSync(dir, { recursive: true })
      pruneOldAttachments(dir)
      if (args.kind === 'png') {
        if (!args.dataUrl.startsWith(PNG_DATA_URL_PREFIX)) {
          return null
        }
        const path = join(dir, `orca-ask-${randomUUID()}.png`)
        writeFileSync(path, Buffer.from(args.dataUrl.slice(PNG_DATA_URL_PREFIX.length), 'base64'))
        return path
      }
      const path = join(dir, `orca-ask-page-${randomUUID()}.md`)
      writeFileSync(path, args.text, 'utf8')
      return path
    }
  )
}
