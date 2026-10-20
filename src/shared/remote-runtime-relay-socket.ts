import WebSocket from 'ws'
import type { ClientOptions } from 'ws'
import { RelayPhoneHelloSchema } from './mobile-relay-phone-protocol'
import type { PairedRuntimeConnection, PairedRuntimeRelayRoute } from './paired-runtime-connection'

// Why a subclass: callers drive the socket by its 'open'/'message' events; holding 'open' back until
// the relay greets lets every existing E2EE client path run unchanged over a relay splice.
class RelayPreludeWebSocket extends WebSocket {
  private preludeStage: 'connecting' | 'awaiting-hello' | 'spliced' = 'connecting'

  constructor(
    address: string,
    private readonly route: PairedRuntimeRelayRoute,
    options?: ClientOptions
  ) {
    super(address, options)
  }

  override emit(event: string | symbol, ...args: unknown[]): boolean {
    if (this.preludeStage === 'spliced') {
      return super.emit(event, ...args)
    }
    if (event === 'open' && this.preludeStage === 'connecting') {
      this.preludeStage = 'awaiting-hello'
      this.send(
        JSON.stringify({
          type: 'relay-auth',
          v: 1,
          mode: 'connect',
          credential: this.route.credential
        })
      )
      return true
    }
    if (event === 'message' && this.preludeStage === 'awaiting-hello') {
      const refusal = this.relayHelloRefusal(args[0])
      if (refusal) {
        super.emit('error', Object.assign(new Error(refusal), { name: 'OrcaRelayRefusal' }))
        this.close(1000)
        return true
      }
      this.preludeStage = 'spliced'
      return super.emit('open')
    }
    return super.emit(event, ...args)
  }

  private relayHelloRefusal(data: unknown): string | null {
    let hello: ReturnType<typeof RelayPhoneHelloSchema.safeParse>
    try {
      hello = RelayPhoneHelloSchema.safeParse(JSON.parse(String(data)))
    } catch {
      return 'Orca Relay sent an unreadable greeting.'
    }
    if (!hello.success) {
      return 'Orca Relay sent an unexpected greeting.'
    }
    if (!hello.data.ok) {
      return `Orca Relay refused the connection (${hello.data.code}).`
    }
    return hello.data.credentialKind === this.route.credentialKind
      ? null
      : `Orca Relay accepted the credential as ${hello.data.credentialKind}, not ${this.route.credentialKind}.`
  }
}

export function relayConnectUrl(
  route: Pick<PairedRuntimeRelayRoute, 'cellUrl' | 'relayHostId'>
): string {
  const url = new URL(route.cellUrl)
  // Why both: pairing offers require an https cell; a local test cell speaks plain http.
  url.protocol = url.protocol === 'http:' ? 'ws:' : 'wss:'
  url.pathname = `/v1/connect/${encodeURIComponent(route.relayHostId)}`
  return url.toString()
}

/** The socket every remote-runtime client opens: direct to the host, or spliced through Orca Relay. */
export function createRemoteRuntimeWebSocket(
  connection: Pick<PairedRuntimeConnection, 'endpoint' | 'relay'>,
  options: ClientOptions
): WebSocket {
  if (!connection.relay) {
    return new WebSocket(connection.endpoint, options)
  }
  // Why no deflate: the relay splices opaque E2EE frames and negotiates none.
  return new RelayPreludeWebSocket(relayConnectUrl(connection.relay), connection.relay, {
    ...options,
    perMessageDeflate: false
  })
}
