import type { ServerWebSocket, WebSocketHandler } from 'bun';

export interface WsData {
  authenticated: boolean;
}

// The stages a control client hears about over WS /events: a request was accepted,
// its stream started, then finished or errored. Named so callers broadcast
// LIFECYCLE_KIND.accepted, not a bare 'accepted'.
export const LIFECYCLE_KIND = {
  accepted: 'accepted',
  started: 'started',
  done: 'done',
  error: 'error',
} as const;
export type LifecycleKind = (typeof LIFECYCLE_KIND)[keyof typeof LIFECYCLE_KIND];

export interface LifecycleEvent {
  event: LifecycleKind;
  chatId: string;
  streamId: string;
}

// All connected, authenticated WS clients.
const wsClients = new Set<ServerWebSocket<WsData>>();

// Push a lifecycle event to every connected control client.
export function broadcast(payload: LifecycleEvent): void {
  const msg = JSON.stringify(payload);
  for (const ws of wsClients) {
    ws.send(msg);
  }
}

// Bun.serve websocket handlers. Control clients are listen-only, so all we do is
// track the open set; inbound messages are ignored.
export const wsHandlers: WebSocketHandler<WsData> = {
  open(ws) {
    wsClients.add(ws);
  },
  close(ws) {
    wsClients.delete(ws);
  },
  message() {
    // Clients are listeners only; ignore inbound messages.
  },
};

// Drop every tracked client. Called when the server stops.
export function clearWsClients(): void {
  wsClients.clear();
}
