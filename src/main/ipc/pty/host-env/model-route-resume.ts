import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  openSync,
  readSync,
  closeSync
} from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { AgentProviderSessionMetadata } from '../../../../shared/agent-session-resume'
import {
  quoteStartupArg,
  tokenizeStartupCommand,
  type AgentStartupShell
} from '../../../../shared/tui-agent-startup-shell'

// Why: a session that ran on a model outside the CLI's own login (DeepSeek, GLM, the Neptune relay) comes
// back on the default model when resumed, because the resume restores only models the CLI knows. A route file
// carries that model's endpoint, key and ids: ~/.claude/model_routes/<model>.json (Claude Code settings) and
// ~/.codex/model_routes/<provider>.json ({ env, config }). This puts the recorded model back on the resume.

export type ModelRouteResume = { command: string; env: Record<string, string> }

type Args = {
  launchAgent: string | undefined
  command: string | undefined
  providerSession: AgentProviderSessionMetadata | undefined
  shell: AgentStartupShell
  wslDistro: string | null
  /** The pane's folder; finds a Claude transcript when the resume names only its session. */
  cwd?: string
  /** Folder the routes live in; the Windows home on a WSL pane, so one copy serves both. */
  routesHome?: string
  codexHomePath?: string | null
}

const TAIL_BYTES = 4 * 1024 * 1024

function readTail(path: string): string {
  const fd = openSync(path, 'r')
  try {
    const size = statSync(path).size
    const length = Math.min(size, TAIL_BYTES)
    const buffer = Buffer.alloc(length)
    readSync(fd, buffer, 0, length, size - length)
    return buffer.toString('utf8')
  } finally {
    closeSync(fd)
  }
}

function readFirstLine(path: string): string {
  const fd = openSync(path, 'r')
  try {
    const buffer = Buffer.alloc(64 * 1024)
    const read = readSync(fd, buffer, 0, buffer.length, 0)
    return buffer.subarray(0, read).toString('utf8').split('\n')[0] ?? ''
  } finally {
    closeSync(fd)
  }
}

/** A guest path read from the Windows host through the distro's UNC share. */
function hostPath(path: string, wslDistro: string | null): string {
  return wslDistro && path.startsWith('/')
    ? `\\\\wsl.localhost\\${wslDistro}${path.replaceAll('/', '\\')}`
    : path
}

/** The route file as the pane's shell names it: a WSL pane reads the Windows copy through /mnt. */
function panePath(path: string, wslDistro: string | null): string {
  const drive = /^([A-Za-z]):[\\/](.*)$/.exec(path)
  return wslDistro && drive
    ? `/mnt/${drive[1].toLowerCase()}/${drive[2].replaceAll('\\', '/')}`
    : path
}

export function routeFileName(model: string): string {
  return `${model.replace(/\[.*$/, '').replaceAll('/', '_')}.json`
}

/** The model of the transcript's last assistant turn. */
export function lastClaudeTranscriptModel(text: string): string | null {
  const lines = text.split('\n')
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (!lines[i].includes('"type":"assistant"')) {
      continue
    }
    try {
      const model = (JSON.parse(lines[i]) as { message?: { model?: unknown } }).message?.model
      if (typeof model === 'string' && model && model !== '<synthetic>') {
        return model
      }
    } catch {
      // A truncated first line of the tail.
    }
  }
  return null
}

/** The rollout's recorded provider and the last model it ran on that provider. */
export function codexRolloutRoute(
  firstLine: string,
  text: string
): { provider: string; model: string } | null {
  const provider = /"model_provider":"([^"]+)"/.exec(firstLine)?.[1]
  if (!provider || provider === 'openai') {
    return null
  }
  const pattern = new RegExp(
    `"thread_settings":\\{"model":"([^"]+)","model_provider_id":"${provider.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`,
    'g'
  )
  const models = [...text.matchAll(pattern)].map((match) => match[1])
  const model = models.at(-1) ?? /"model":"([^"]+)"/.exec(firstLine)?.[1]
  return model ? { provider, model } : null
}

function hasToken(tokens: readonly string[], names: readonly string[]): boolean {
  return tokens.some((token) =>
    names.some((name) => token === name || token.startsWith(`${name}=`))
  )
}

function spliceAfter(command: string, at: number, insert: string): string {
  return `${command.slice(0, at)} ${insert}${command.slice(at)}`
}

const SEPARATORS = new Set([';', '&&', '||', '&', '--', '|'])

/** The agent's executable in command position: first, or after a separator (`cd … && claude`, `Set-Location …; claude.exe`). */
function findAgentExecutableIndex(tokens: readonly string[], name: 'claude' | 'codex'): number {
  const executable = new RegExp(`^${name}(\\.(exe|cmd|bat|ps1))?$`, 'i')
  return tokens.findIndex(
    (token, i) =>
      executable.test(token.split(/[\\/]/).pop() ?? '') &&
      (i === 0 || SEPARATORS.has(tokens[i - 1]) || /[;&|]$/.test(tokens[i - 1]))
  )
}

/** A local Claude session's transcript: under the pane's folder, else under whichever project holds it. */
function findClaudeTranscript(args: Args, sessionId: string): string | undefined {
  if (args.wslDistro) {
    return undefined
  }
  const projects = join(homedir(), '.claude', 'projects')
  const byFolder = args.cwd
    ? join(projects, args.cwd.replace(/[^A-Za-z0-9]/g, '-'), `${sessionId}.jsonl`)
    : undefined
  if (byFolder && existsSync(byFolder)) {
    return byFolder
  }
  try {
    for (const project of readdirSync(projects)) {
      const candidate = join(projects, project, `${sessionId}.jsonl`)
      if (existsSync(candidate)) {
        return candidate
      }
    }
  } catch {
    // No Claude projects folder.
  }
  return undefined
}

function findCodexRollout(args: Args, sessionId: string): string | null {
  const given = args.providerSession?.transcriptPath
  if (given && existsSync(hostPath(given, args.wslDistro))) {
    return hostPath(given, args.wslDistro)
  }
  const sessions = join(args.codexHomePath ?? join(homedir(), '.codex'), 'sessions')
  const stack = [sessions]
  while (stack.length > 0) {
    const dir = stack.pop()!
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      continue
    }
    for (const entry of entries) {
      const path = join(dir, entry)
      if (entry.endsWith(`${sessionId}.jsonl`)) {
        return path
      }
      if (!entry.includes('.')) {
        stack.push(path)
      }
    }
  }
  return null
}

/** The session a typed resume names: `claude --resume <id>` / `codex resume <id>`. */
function sessionIdFromCommand(tokens: readonly string[]): string | undefined {
  for (let i = 0; i < tokens.length - 1; i += 1) {
    if (['--resume', '-r', 'resume'].includes(tokens[i]) && !tokens[i + 1].startsWith('-')) {
      return tokens[i + 1]
    }
  }
  return tokens.find((token) => token.startsWith('--resume='))?.slice('--resume='.length)
}

export function resolveModelRouteResume(args: Args): ModelRouteResume | null {
  const { command, shell, wslDistro } = args
  if (!command) {
    return null
  }
  const tokenized = tokenizeStartupCommand(command, shell)
  if (!tokenized.ok) {
    return null
  }
  const { tokens, spans } = tokenized
  const sessionId = args.providerSession?.id ?? sessionIdFromCommand(tokens)
  if (!sessionId) {
    return null
  }
  const claudeTranscript =
    args.providerSession?.transcriptPath ?? findClaudeTranscript(args, sessionId)
  // A typed launch (`orca terminal create --command`) names no agent; the command does.
  const agent =
    args.launchAgent ??
    (findAgentExecutableIndex(tokens, 'claude') !== -1
      ? 'claude'
      : findAgentExecutableIndex(tokens, 'codex') !== -1
        ? 'codex'
        : undefined)
  const routesHome = args.routesHome ?? homedir()
  const quote = (value: string): string => quoteStartupArg(value, shell)
  try {
    if (agent === 'claude') {
      const at = findAgentExecutableIndex(tokens, 'claude')
      if (at === -1 || hasToken(tokens, ['--model', '--settings']) || !claudeTranscript) {
        return null
      }
      const model = lastClaudeTranscriptModel(readTail(hostPath(claudeTranscript, wslDistro)))
      if (!model || model.startsWith('claude-')) {
        return null
      }
      const route = join(routesHome, '.claude', 'model_routes', routeFileName(model))
      if (!existsSync(route)) {
        return null
      }
      const routeModel =
        (JSON.parse(readFileSync(route, 'utf8')) as { env?: { ANTHROPIC_MODEL?: string } }).env
          ?.ANTHROPIC_MODEL ?? model
      return {
        command: spliceAfter(
          command,
          spans[at].end,
          `--settings ${quote(panePath(route, wslDistro))} --model ${quote(routeModel)}`
        ),
        // Claude skips its own resume model restore, and its warning, only when this is in its environment.
        env: { ANTHROPIC_MODEL: routeModel }
      }
    }
    if (agent === 'codex') {
      const at = findAgentExecutableIndex(tokens, 'codex')
      const resumeAt = tokens.indexOf('resume')
      if (at === -1 || resumeAt <= at || hasToken(tokens, ['-m', '--model', '--profile', '-p'])) {
        return null
      }
      const rollout = findCodexRollout(args, sessionId)
      if (!rollout) {
        return null
      }
      const recorded = codexRolloutRoute(readFirstLine(rollout), readTail(rollout))
      const route = recorded
        ? join(routesHome, '.codex', 'model_routes', `${recorded.provider}.json`)
        : null
      if (!recorded || !route || !existsSync(route)) {
        return null
      }
      const parsed = JSON.parse(readFileSync(route, 'utf8')) as {
        env?: Record<string, string>
        config?: string[]
      }
      // -c is Codex's top-level option, so it goes before the subcommand; -m belongs to the resume.
      const withModel = spliceAfter(command, spans[resumeAt].end, `-m ${quote(recorded.model)}`)
      const config = (parsed.config ?? []).map((line) => `-c ${quote(line)}`).join(' ')
      return {
        command: config ? spliceAfter(withModel, spans[at].end, config) : withModel,
        env: parsed.env ?? {}
      }
    }
  } catch {
    return null
  }
  return null
}
