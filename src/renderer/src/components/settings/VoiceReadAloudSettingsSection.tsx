import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { SpeakRepliesStatus, VoiceSettings } from '../../../../shared/speech-types'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Separator } from '../ui/separator'
import { Switch } from '../ui/switch'
import { useShortcutLabel } from '@/hooks/useShortcutLabel'
import { translate } from '@/i18n/i18n'
import { speakReply } from '../speak-replies/reply-speech-player'

type VoiceReadAloudSettingsSectionProps = {
  voiceSettings: VoiceSettings
  onUpdateVoiceSettings: (updates: Partial<VoiceSettings>) => void
}

function TextSetting({
  id,
  label,
  description,
  value,
  placeholder,
  onCommit
}: {
  id: string
  label: string
  description: string
  value: string
  placeholder?: string
  onCommit: (value: string) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const commit = (): void => {
    if (draft.trim() !== value) {
      onCommit(draft.trim())
    }
  }
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="space-y-0.5">
        <Label htmlFor={id}>{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Input
        id={id}
        className="w-72 shrink-0"
        value={draft}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            commit()
          }
        }}
      />
    </div>
  )
}

export function VoiceReadAloudSettingsSection({
  voiceSettings,
  onUpdateVoiceSettings
}: VoiceReadAloudSettingsSectionProps): React.JSX.Element {
  const shortcutLabel = useShortcutLabel('voice.speakReplies.toggle')
  const [status, setStatus] = useState<SpeakRepliesStatus | null>(null)
  const [keyDraft, setKeyDraft] = useState('')
  const [keyPending, setKeyPending] = useState(false)

  const refreshStatus = useCallback((): void => {
    void window.api.speech
      .getSpeakRepliesStatus()
      .then(setStatus)
      .catch(() => {})
  }, [])
  useEffect(refreshStatus, [refreshStatus, voiceSettings.azureSpeechRegion])

  const saveKey = async (key: string | null): Promise<void> => {
    setKeyPending(true)
    try {
      setStatus(await window.api.speech.setAzureSpeechCredentials(key))
      setKeyDraft('')
      toast.success(
        key
          ? translate('auto.components.settings.readAloud.keySaved', 'Azure Speech key saved')
          : translate('auto.components.settings.readAloud.keyCleared', 'Azure Speech key cleared')
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setKeyPending(false)
    }
  }

  const keyDescription =
    status?.azureSpeechKey === 'stored'
      ? translate('auto.components.settings.readAloud.keyStored', 'A key is stored in Orca.')
      : status?.azureSpeechKey === 'environment'
        ? translate(
            'auto.components.settings.readAloud.keyFromEnv',
            'Using AZURE_SPEECH_KEY from the environment.'
          )
        : translate(
            'auto.components.settings.readAloud.keyMissing',
            'No key: replies are read with the system voice.'
          )

  return (
    <>
      <div className="flex items-center justify-between gap-4 py-2">
        <div className="space-y-0.5">
          <Label>
            {translate('auto.components.settings.readAloud.enable', 'Read Replies Aloud')}
          </Label>
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.settings.readAloud.enableDescription',
              'Speak each finished agent reply. Toggle with'
            )}{' '}
            {shortcutLabel}
            {translate(
              'auto.components.settings.readAloud.enableDescriptionEnd',
              '; dictating or sending a new prompt stops it.'
            )}
          </p>
        </div>
        <Switch
          checked={voiceSettings.speakReplies}
          aria-label={translate('auto.components.settings.readAloud.enable', 'Read Replies Aloud')}
          onCheckedChange={(checked) => onUpdateVoiceSettings({ speakReplies: checked })}
        />
      </div>

      <Separator />

      <div className="flex items-center justify-between gap-4 py-2">
        <div className="space-y-0.5">
          <Label>
            {translate('auto.components.settings.readAloud.scope', 'Which Agents Speak')}
          </Label>
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.settings.readAloud.scopeDescription',
              'The agent pane you last focused, or every agent that finishes.'
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center rounded-md border border-border/60 bg-background/50 p-0.5">
          {(['focused', 'all'] as const).map((scope) => (
            <button
              key={scope}
              onClick={() => onUpdateVoiceSettings({ speakScope: scope })}
              className={`rounded-sm px-3 py-1 text-sm transition-colors ${
                voiceSettings.speakScope === scope
                  ? 'bg-accent font-medium text-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {scope === 'focused'
                ? translate('auto.components.settings.readAloud.scopeFocused', 'Focused agent')
                : translate('auto.components.settings.readAloud.scopeAll', 'Every agent')}
            </button>
          ))}
        </div>
      </div>

      <Separator />

      <TextSetting
        id="speak-voice"
        label={translate('auto.components.settings.readAloud.voice', 'Voice')}
        description={translate(
          'auto.components.settings.readAloud.voiceDescription',
          'Azure voice for English and mixed replies.'
        )}
        value={voiceSettings.speakVoice}
        onCommit={(value) => value && onUpdateVoiceSettings({ speakVoice: value })}
      />
      <TextSetting
        id="speak-voice-zh"
        label={translate('auto.components.settings.readAloud.voiceZh', 'Chinese Voice')}
        description={translate(
          'auto.components.settings.readAloud.voiceZhDescription',
          'Azure voice for replies that are mostly Chinese.'
        )}
        value={voiceSettings.speakVoiceZh}
        onCommit={(value) => value && onUpdateVoiceSettings({ speakVoiceZh: value })}
      />
      <TextSetting
        id="speak-rate"
        label={translate('auto.components.settings.readAloud.rate', 'Speaking Rate')}
        description={translate(
          'auto.components.settings.readAloud.rateDescription',
          'Percent faster (or slower, when negative) than normal.'
        )}
        value={String(voiceSettings.speakRate)}
        onCommit={(value) => {
          const rate = Number(value.replace(/%$/, ''))
          if (Number.isInteger(rate) && rate >= -50 && rate <= 100) {
            onUpdateVoiceSettings({ speakRate: rate })
          }
        }}
      />
      <div className="flex items-center justify-between gap-4 py-2">
        <div className="space-y-0.5">
          <Label>
            {translate(
              'auto.components.settings.readAloud.mixedVoices',
              'Switch Voices in Mixed Replies (Experimental)'
            )}
          </Label>
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.settings.readAloud.mixedVoicesDescription',
              'Read the Chinese parts of a reply with the Chinese voice and the rest with the English voice.'
            )}
          </p>
        </div>
        <Switch
          checked={voiceSettings.speakMixedVoices}
          aria-label={translate(
            'auto.components.settings.readAloud.mixedVoices',
            'Switch Voices in Mixed Replies (Experimental)'
          )}
          onCheckedChange={(checked) => onUpdateVoiceSettings({ speakMixedVoices: checked })}
        />
      </div>
      <TextSetting
        id="speak-region"
        label={translate('auto.components.settings.readAloud.region', 'Azure Region')}
        description={translate(
          'auto.components.settings.readAloud.regionDescription',
          'Empty uses AZURE_SPEECH_REGION.'
        )}
        value={voiceSettings.azureSpeechRegion}
        placeholder={status?.azureSpeechRegion || undefined}
        onCommit={(value) => onUpdateVoiceSettings({ azureSpeechRegion: value })}
      />

      <Separator />

      <div className="flex items-center justify-between gap-4 py-2">
        <div className="space-y-0.5">
          <Label htmlFor="azure-speech-key">
            {translate('auto.components.settings.readAloud.key', 'Azure Speech Key')}
          </Label>
          <p className="text-xs text-muted-foreground">{keyDescription}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Input
            id="azure-speech-key"
            type="password"
            className="w-48"
            value={keyDraft}
            disabled={keyPending}
            onChange={(event) => setKeyDraft(event.target.value)}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={keyPending || !keyDraft.trim()}
            onClick={() => void saveKey(keyDraft)}
          >
            {translate('auto.components.settings.readAloud.save', 'Save')}
          </Button>
          {status?.azureSpeechKey === 'stored' ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={keyPending}
              onClick={() => void saveKey(null)}
            >
              {translate('auto.components.settings.readAloud.clear', 'Clear')}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              void speakReply(
                translate(
                  'auto.components.settings.readAloud.sample',
                  'This is how agent replies will sound.'
                ),
                null
              )
            }
          >
            {translate('auto.components.settings.readAloud.test', 'Test')}
          </Button>
        </div>
      </div>

      <Separator />
    </>
  )
}
