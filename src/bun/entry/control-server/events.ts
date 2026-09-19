import type { BridgePush } from '@shared/rpc/bridge-push.types'
import type { ServerWebSocket, WebSocketHandler } from 'bun'

// The two audiences that connect over WebSocket. They share one Bun.serve handler, so a
// socket carries the channel it was upgraded on and every send is addressed by it.
export const WS_CHANNEL = {
  // /events: paired control clients listening for chat lifecycle.
  events: 'events',
  // /bridge: the dev browser bridge, receiving what the desktop window receives.
  bridge: 'bridge',
} as const
export type WsChannel = (typeof WS_CHANNEL)[keyof typeof WS_CHANNEL]

export type WsData = {
  authenticated: boolean
  channel: WsChannel
}

// The stages a control client hears about over WS /events: a request was accepted,
// its stream started, then finished or errored. Named so callers broadcast
// LIFECYCLE_KIND.accepted, not a bare 'accepted'.
export const LIFECYCLE_KIND = {
  accepted: 'accepted',
  started: 'started',
  done: 'done',
  error: 'error',
} as const
export type LifecycleKind = (typeof LIFECYCLE_KIND)[keyof typeof LIFECYCLE_KIND]

export type LifecycleEvent = {
  event: LifecycleKind
  chatId: string
  streamId: string
}

// Connected, authenticated control clients on /events.
const wsClients = new Set<ServerWebSocket<WsData>>()

// Connected dev browser bridges on /bridge. Kept apart from the control clients because
// /events is a documented external API, and its clients must never start seeing the
// renderer's own traffic.
const bridgeClients = new Set<ServerWebSocket<WsData>>()

// Push a lifecycle event to every connected control client.
export function broadcast(payload: LifecycleEvent): void {
  send(wsClients, payload)
}

// Push one renderer message to every connected browser bridge. The desktop window gets
// the same message over Electrobun's own transport, so both render the same run.
export function broadcastToBridge(push: BridgePush): void {
  send(bridgeClients, push)
}

function send(clients: Set<ServerWebSocket<WsData>>, payload: unknown): void {
  const msg = JSON.stringify(payload)
  for (const ws of clients) {
    ws.send(msg)
  }
}

// Bun.serve websocket handlers. Both audiences are listen-only, so all we do is track
// the open set each socket belongs to; inbound messages are ignored.
export const wsHandlers: WebSocketHandler<WsData> = {
  open(ws) {
    clientsFor(ws).add(ws)
  },
  close(ws) {
    clientsFor(ws).delete(ws)
  },
  message() {
    // Clients are listeners only; ignore inbound messages.
  },
}

function clientsFor(ws: ServerWebSocket<WsData>): Set<ServerWebSocket<WsData>> {
  return ws.data.channel === WS_CHANNEL.bridge ? bridgeClients : wsClients
}

// Drop every tracked client. Called when the server stops.
export function clearWsClients(): void {
  wsClients.clear()
  bridgeClients.clear()
}
