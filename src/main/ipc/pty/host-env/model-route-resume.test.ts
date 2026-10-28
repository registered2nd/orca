import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { quoteStartupArg } from '../../../../shared/tui-agent-startup-shell'
import {
  codexRolloutRoute,
  lastClaudeTranscriptModel,
  resolveModelRouteResume
} from './model-route-resume'

function home(): string {
  const dir = mkdtempSync(join(tmpdir(), 'model-route-'))
  mkdirSync(join(dir, '.claude', 'model_routes'), { recursive: true })
  mkdirSync(join(dir, '.codex', 'model_routes'), { recursive: true })
  return dir
}

const assistant = (model: string): string =>
  JSON.stringify({ type: 'assistant', message: { model, content: [] } })

describe('lastClaudeTranscriptModel', () => {
  it('takes the last real assistant model', () => {
    const text = [assistant('deepseek-flash'), assistant('<synthetic>'), '{"type":"user"}'].join(
      '\n'
    )
    expect(lastClaudeTranscriptModel(text)).toBe('deepseek-flash')
  })
})

describe('codexRolloutRoute', () => {
  it('takes the last model run on the recorded provider', () => {
    const first = '{"payload":{"model_provider":"deepseek","model":"deepseek-flash"}}'
    const text = [
      '"thread_settings":{"model":"deepseek-flash","model_provider_id":"deepseek"}',
      '"thread_settings":{"model":"gpt-6-astra","model_provider_id":"openai"}'
    ].join('\n')
    expect(codexRolloutRoute(first, text)).toEqual({
      provider: 'deepseek',
      model: 'deepseek-flash'
    })
  })

  it('leaves an OpenAI session alone', () => {
    expect(codexRolloutRoute('{"payload":{"model_provider":"openai"}}', '')).toBeNull()
  })
})

describe('resolveModelRouteResume', () => {
  it('adds the route, model and environment to a Claude resume on a routed model', () => {
    const dir = home()
    const transcript = join(dir, 'session.jsonl')
    writeFileSync(transcript, assistant('deepseek-flash'))
    const route = join(dir, '.claude', 'model_routes', 'deepseek-flash.json')
    writeFileSync(route, JSON.stringify({ env: { ANTHROPIC_MODEL: 'deepseek-flash[1m]' } }))
    const resumed = resolveModelRouteResume({
      launchAgent: 'claude',
      command: 'claude --effort high --resume abc',
      providerSession: { key: 'session_id', id: 'abc', transcriptPath: transcript },
      shell: 'posix',
      wslDistro: null,
      routesHome: dir
    })
    expect(resumed?.command).toBe(
      `claude --settings ${quoteStartupArg(route, 'posix')} --model 'deepseek-flash[1m]' --effort high --resume abc`
    )
    expect(resumed?.env).toEqual({ ANTHROPIC_MODEL: 'deepseek-flash[1m]' })
  })

  it('leaves a Claude session on a Claude model, or with an explicit model, alone', () => {
    const dir = home()
    const transcript = join(dir, 'session.jsonl')
    writeFileSync(transcript, assistant('claude-opus-5-5'))
    const base = {
      launchAgent: 'claude',
      providerSession: { key: 'session_id' as const, id: 'abc', transcriptPath: transcript },
      shell: 'posix' as const,
      wslDistro: null,
      routesHome: dir
    }
    expect(resolveModelRouteResume({ ...base, command: 'claude --resume abc' })).toBeNull()
    writeFileSync(transcript, assistant('deepseek-flash'))
    expect(
      resolveModelRouteResume({ ...base, command: 'claude --model x --resume abc' })
    ).toBeNull()
  })

  it('puts the provider config before the subcommand and the model on the Codex resume', () => {
    const dir = home()
    const rollout = join(dir, 'rollout-x-abc.jsonl')
    writeFileSync(
      rollout,
      [
        '{"payload":{"model_provider":"neptune"}}',
        '"thread_settings":{"model":"qwen38-27b","model_provider_id":"neptune"}'
      ].join('\n')
    )
    writeFileSync(
      join(dir, '.codex', 'model_routes', 'neptune.json'),
      JSON.stringify({ env: { NEPTUNE_KEY: 'k' }, config: ['model_provider=neptune'] })
    )
    const resumed = resolveModelRouteResume({
      launchAgent: 'codex',
      command: 'codex resume abc',
      providerSession: { key: 'session_id', id: 'abc', transcriptPath: rollout },
      shell: 'posix',
      wslDistro: null,
      routesHome: dir
    })
    expect(resumed?.command).toBe("codex -c 'model_provider=neptune' resume -m 'qwen38-27b' abc")
    expect(resumed?.env).toEqual({ NEPTUNE_KEY: 'k' })
  })
})
