import { MessageCircleQuestion } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTranslate } from '@/i18n/use-translate'
import type { BrowserChromeElementTools } from './browser-annotate-split-button'

/** Opens and closes the page's Ask panel; the picker's third intent beside Grab and Annotate. */
export function BrowserChromeAskButton({
  tools
}: {
  tools: BrowserChromeElementTools
}): React.JSX.Element {
  const t = useTranslate()
  const label = t('auto.components.browser.pane.ask.toolbar', 'Ask your agent about this page')
  const active = tools.activeIntent === 'ask'
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* Why: wrap in a span so the tooltip still fires when disabled. */}
        <span className="inline-flex shrink-0">
          <Button
            size="icon"
            variant={active ? 'default' : 'ghost'}
            className="h-7 w-7"
            onClick={() => tools.onStartIntent('ask')}
            disabled={!active && tools.disabled}
            aria-label={label}
            aria-pressed={active}
          >
            <MessageCircleQuestion className="size-4" />
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
