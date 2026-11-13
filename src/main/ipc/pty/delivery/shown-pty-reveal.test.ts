import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPtyIpcSession, type PtyIpcSession, type PtyRendererDelivery } from '../session'
import { mainDeliveryBreadcrumbs } from './debug'
import {
  _resetHiddenRendererPtyDeliveryGateForTest,
  isHiddenRendererPty,
  markHiddenRendererPty
} from './pty-hidden-delivery-gate'
import {
  activeRendererPtys,
  rendererVisibilityKnownPtys,
  visibleRendererPtys
} from './visibility-state'
import { wirePtyIpcSession } from './wire-session'

const PTY_ID = 'repo::/worktree@@shown001'

type Sent = { channel: string; payload: Record<string, unknown> }

function createHarness(focused: boolean): { session: PtyIpcSession; sent: () => Sent[] } {
  const send = vi.fn()
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: delivery reads only these window members.
  const mainWindow = {
    isDestroyed: () => false,
    isFocused: () => focused,
    isVisible: () => true,
    isMinimized: () => false,
    webContents: { id: 1, isDestroyed: () => false, send, on: vi.fn(), removeListener: vi.fn() }
  } as unknown as PtyRendererDelivery
  const session = createPtyIpcSession({ mainWindow })
  wirePtyIpcSession(session)
  session.rendererPtyDispatcherReady = true
  // Keep the once-a-minute contradiction warning quiet; it is not under test.
  session.lastHiddenDropContradictionWarnAtMs = Date.now()
  return {
    session,
    sent: () => send.mock.calls.map(([channel, payload]) => ({ channel, payload }))
  }
}

/** The window shows the pane, yet a claim nothing releases still marks its terminal hidden. */
function showPaneWithStaleHiddenMark(): void {
  rendererVisibilityKnownPtys.add(PTY_ID)
  visibleRendererPtys.add(PTY_ID)
  markHiddenRendererPty(PTY_ID)
}

function markers(sent: Sent[]): Record<string, unknown>[] {
  return sent
    .filter((call) => call.channel === 'pty:modelRestoreNeeded')
    .map((call) => call.payload)
}

function deliveredData(sent: Sent[]): string {
  return sent
    .filter((call) => call.channel === 'pty:data' && call.payload.id === PTY_ID)
    .map((call) => String(call.payload.data))
    .join('')
}

describe('hidden terminal shown in the focused window', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    _resetHiddenRendererPtyDeliveryGateForTest()
    visibleRendererPtys.clear()
    activeRendererPtys.clear()
    rendererVisibilityKnownPtys.clear()
    mainDeliveryBreadcrumbs.reset()
  })

  it('is revealed on its next output, repainted from the snapshot, then delivered live', () => {
    const { session, sent } = createHarness(true)
    showPaneWithStaleHiddenMark()

    session.acceptPtyDataForRenderer({ id: PTY_ID, data: 'first' }, 5)

    expect(isHiddenRendererPty(PTY_ID)).toBe(false)
    expect(markers(sent())).toEqual([
      { id: PTY_ID, reason: 'unhide', markerSeq: 5, hiddenDropEpisode: expect.any(Number) }
    ])
    expect(mainDeliveryBreadcrumbs.snapshot().map((crumb) => crumb.kind)).toContain(
      'gate-unmark-shown'
    )

    session.acceptPtyDataForRenderer({ id: PTY_ID, data: 'second' }, 11)
    vi.runOnlyPendingTimers()

    expect(deliveredData(sent())).toBe('second')
  })

  it('is revealed when queued output is discarded at flush', () => {
    const { session, sent } = createHarness(true)
    rendererVisibilityKnownPtys.add(PTY_ID)
    visibleRendererPtys.add(PTY_ID)
    session.acceptPtyDataForRenderer({ id: PTY_ID, data: 'queued' }, 6)
    markHiddenRendererPty(PTY_ID)

    session.flushPendingData()

    expect(isHiddenRendererPty(PTY_ID)).toBe(false)
    expect(markers(sent()).map((marker) => marker.reason)).toEqual(['unhide'])
    expect(deliveredData(sent())).toBe('')
  })

  it('stays hidden while the window lacks focus, where its document may be hidden', () => {
    const { session, sent } = createHarness(false)
    showPaneWithStaleHiddenMark()

    session.acceptPtyDataForRenderer({ id: PTY_ID, data: 'first' }, 5)

    expect(isHiddenRendererPty(PTY_ID)).toBe(true)
    expect(markers(sent()).map((marker) => marker.reason)).toEqual(['hidden-drop'])
    expect(deliveredData(sent())).toBe('')
  })

  it('stays hidden when the window does not show its pane', () => {
    const { session, sent } = createHarness(true)
    rendererVisibilityKnownPtys.add(PTY_ID)
    markHiddenRendererPty(PTY_ID)

    session.acceptPtyDataForRenderer({ id: PTY_ID, data: 'first' }, 5)

    expect(isHiddenRendererPty(PTY_ID)).toBe(true)
    expect(markers(sent()).map((marker) => marker.reason)).toEqual(['hidden-drop'])
  })
})
