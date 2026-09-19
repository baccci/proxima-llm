import { log } from '../../infra/logging/logger'
import { toErrorMessage } from '../../utils/to-error'
import { BROWSER_BRIDGE_ENABLED } from './bridge-mode'
import { clearWsClients, WS_CHANNEL, type WsChannel, type WsData, wsHandlers } from './events'
import { authenticate, err } from './http'
import { handleRequest } from './routes'

let server: ReturnType<typeof Bun.serve> | null = null

export function startControlServer(port: number): void {
  // Idempotent: a second call while already running is a no-op.
  if (server) {
    return
  }

  server = Bun.serve<WsData>({
    hostname: '127.0.0.1',
    port,
    fetch(req, srv) {
      // The /events WebSocket upgrade must happen here at the Bun.serve boundary;
      // every other route is delegated to handleRequest below.
      const url = new URL(req.url)
      if (url.pathname === '/events') {
        if (!authenticate(req)) {
          return new Response('Unauthorized', { status: 401 })
        }

        return upgradeOrFail(srv, req, WS_CHANNEL.events, true)
      }

      // The dev browser bridge's push channel, carrying what the desktop window gets.
      // Unauthenticated for the same reason POST /rpc is, and gone outside dev for the
      // same reason too. A WebSocket handshake is not subject to CORS, so the dev gate
      // is the whole of the protection here.
      if (url.pathname === '/bridge' && BROWSER_BRIDGE_ENABLED) {
        return upgradeOrFail(srv, req, WS_CHANNEL.bridge, false)
      }

      return handleRequest(req).catch((e) => {
        const message = toErrorMessage(e)
        log.error('[control-server] Unhandled fetch error', e)
        return err(message, 500)
      })
    },
    websocket: wsHandlers,
  })
  console.log(`Control server listening on 127.0.0.1:${port}`)
}

export function stopControlServer(): void {
  if (!server) {
    return
  }

  server.stop(true)
  server = null
  clearWsClients()
  console.log('Control server stopped')
}

function upgradeOrFail(
  srv: Bun.Server<WsData>,
  req: Request,
  channel: WsChannel,
  authenticated: boolean,
): Response | undefined {
  const upgraded = srv.upgrade(req, { data: { authenticated, channel } })
  if (upgraded) {
    return undefined
  }

  return new Response('Upgrade failed', { status: 500 })
}
