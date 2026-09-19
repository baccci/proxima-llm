import type { AppRPC } from '@shared/rpc/app-rpc.types'
import type { BridgePush } from '@shared/rpc/bridge-push.types'

type WebviewMessages = AppRPC['webview']['messages']

// The renderer's handler for each push channel. Electrobun dispatches these over its own
// bridge; over the dev browser bridge they arrive as socket frames instead, and the same
// handlers run either way.
export type BridgePushHandlers = {
  [C in keyof WebviewMessages]: (payload: WebviewMessages[C]) => void
}

// How long to wait before dialling the bridge again. The bun process restarts often in
// dev, so a dropped socket is expected rather than exceptional.
const RECONNECT_DELAY_MS = 1_000

// Keep a socket open to the bridge, feeding every frame to the app's message handlers,
// and redial whenever it drops.
export function connectBridgePush(url: string, handlers: BridgePushHandlers): void {
  const socket = new WebSocket(url)

  socket.addEventListener('message', (event) => {
    dispatchBridgePush(String(event.data), handlers)
  })

  socket.addEventListener('close', () => {
    setTimeout(() => connectBridgePush(url, handlers), RECONNECT_DELAY_MS)
  })

  socket.addEventListener('error', () => {
    // The close handler that follows owns the retry, so there is nothing to do here
    // beyond keeping the error off the console as an unhandled event.
    socket.close()
  })
}

// Route one frame to the handler named by its channel. Anything unrecognised is dropped:
// a push the renderer does not know about is not worth breaking the socket over.
export function dispatchBridgePush(raw: string, handlers: BridgePushHandlers): void {
  const push = parsePush(raw)
  if (!push) {
    return
  }

  // An own-property check keeps a frame naming toString or constructor from reaching a
  // builtin, the same guard the bun end puts in front of its handler table.
  // biome-ignore lint/suspicious/noPrototypeBuiltins: Object.hasOwn needs lib es2022
  if (!Object.prototype.hasOwnProperty.call(handlers, push.channel)) {
    return
  }

  const handle = handlers[push.channel] as (payload: unknown) => void
  handle(push.payload)
}

function parsePush(raw: string): BridgePush | null {
  try {
    const parsed = JSON.parse(raw) as Partial<BridgePush>
    return typeof parsed?.channel === 'string' ? (parsed as BridgePush) : null
  } catch {
    return null
  }
}
