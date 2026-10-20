import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getVtypesAgentApiFilePath, VtypesAppSession } from './vtypes-app-client'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

describe('getVtypesAgentApiFilePath', () => {
  it('follows the Vtypes app config dir on each OS', () => {
    expect(getVtypesAgentApiFilePath('win32', { APPDATA: 'C:\\AppData\\Roaming' }, 'C:\\h')).toBe(
      join('C:\\AppData\\Roaming', 'com.vtype.desktop', 'agent-api.json')
    )
    expect(getVtypesAgentApiFilePath('darwin', {}, '/Users/s')).toBe(
      join('/Users/s', 'Library', 'Application Support', 'com.vtype.desktop', 'agent-api.json')
    )
    expect(getVtypesAgentApiFilePath('linux', {}, '/home/s')).toBe(
      join('/home/s', '.config', 'com.vtype.desktop', 'agent-api.json')
    )
  })
})

describe('VtypesAppSession', () => {
  const fetchMock = vi.fn<typeof fetch>()
  let dir: string
  let endpointFile: string

  const recordedSession = (): VtypesAppSession => {
    const session = new VtypesAppSession(() => endpointFile)
    session.feedAudio(new Float32Array(1600).fill(0.1), 16000)
    return session
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vtypes-app-'))
    endpointFile = join(dir, 'agent-api.json')
    writeFileSync(endpointFile, JSON.stringify({ port: 54321, token: 'tok' }))
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    rmSync(dir, { recursive: true, force: true })
  })

  it('posts the recording to the running app and returns its text', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ text: ' Fix the build. ', raw: 'fix the build' })
    )

    await expect(recordedSession().finish()).resolves.toBe('Fix the build.')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://127.0.0.1:54321/v1/dictate')
    expect(init?.headers).toEqual({
      authorization: 'Bearer tok',
      'content-type': 'application/json'
    })
    const body = JSON.parse(String(init?.body))
    expect(body.app).toBe('Orca')
    expect(Buffer.from(body.audio, 'base64').subarray(0, 4).toString()).toBe('RIFF')
  })

  it('says Vtypes is not running when its endpoint file is missing', async () => {
    rmSync(endpointFile)
    await expect(recordedSession().finish()).rejects.toThrow("Vtypes isn't running")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('says Vtypes is not running when the port refuses the connection', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))
    await expect(recordedSession().finish()).rejects.toThrow("Vtypes isn't running")
  })

  it('treats a rejected token as a Vtypes that has restarted', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'missing or wrong token' }, 401))
    await expect(recordedSession().finish()).rejects.toThrow("Vtypes isn't running")
  })

  it("passes Vtypes's own error through", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'No API key selected' }, 500))
    await expect(recordedSession().finish()).rejects.toThrow(
      'Vtypes could not dictate: No API key selected'
    )
  })

  it('sends nothing when no audio was recorded', async () => {
    await expect(new VtypesAppSession(() => endpointFile).finish()).resolves.toBe('')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
