import type { AppRPC } from './app-rpc.types'

type WebviewMessages = AppRPC['webview']['messages']

// One bun-to-renderer push as it travels over the dev browser bridge's socket, named by
// the channel it belongs to. Electrobun carries the same channel-and-payload pair inside
// its own encrypted envelope; this is that pair written out for a plain WebSocket, so a
// browser tab can receive exactly what the desktop window receives.
export type BridgePush = {
  [C in keyof WebviewMessages]: { channel: C; payload: WebviewMessages[C] }
}[keyof WebviewMessages]
