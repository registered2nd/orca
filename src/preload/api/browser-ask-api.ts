import type {
  BrowserAskReadPageArgs,
  BrowserAskReadPageResult,
  BrowserAskSaveAttachmentArgs
} from '../../shared/browser-grab-types'

/** window.api.browser members behind the toolbar's Ask panel. */
export type BrowserAskApi = {
  askReadPage: (args: BrowserAskReadPageArgs) => Promise<BrowserAskReadPageResult>
  askSaveAttachment: (args: BrowserAskSaveAttachmentArgs) => Promise<string | null>
}
