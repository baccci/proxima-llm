import { beforeEach, describe, expect, test } from 'bun:test'
import type { ServerWebSocket } from 'bun'
import {
  broadcast,
  broadcastToBridge,
  clearWsClients,
  LIFECYCLE_KIND,
  WS_CHANNEL,
  type WsChannel,
  type WsData,
  wsHandlers,
} from './events'

// A stand-in for a connected socket that records what was pushed at it. Real objects
// rather than mocks: all the code under test does is call send, so recording it is
// enough to prove who got what.
function fakeClient(channel: WsChannel) {
  const sent: unknown[] = []
  const ws = {
    data: { authenticated: true, channel },
    send: (msg: string) => {
      sent.push(JSON.parse(msg))
    },
  } as unknown as ServerWebSocket<WsData>

  return { ws, sent }
}

const lifecycleEvent = {
  event: LIFECYCLE_KIND.started,
  chatId: 'chat-1',
  streamId: 'stream-1',
}

const bridgePush = {
  channel: 'chatsUpdated',
  payload: {},
} as const

describe('websocket audiences', () => {
  beforeEach(() => {
    clearWsClients()
  })

  test('a bridge client receives a bridge push', () => {
    const client = fakeClient(WS_CHANNEL.bridge)
    wsHandlers.open?.(client.ws)

    broadcastToBridge(bridgePush)

    expect(client.sent).toEqual([bridgePush])
  })

  test('an events client receives a lifecycle event', () => {
    const client = fakeClient(WS_CHANNEL.events)
    wsHandlers.open?.(client.ws)

    broadcast(lifecycleEvent)

    expect(client.sent).toEqual([lifecycleEvent])
  })

  test('renderer pushes never reach a control client', () => {
    // /events is a documented, authenticated API with its own clients. They must not
    // start seeing the renderer's traffic just because the dev bridge is open.
    const control = fakeClient(WS_CHANNEL.events)
    wsHandlers.open?.(control.ws)

    broadcastToBridge(bridgePush)

    expect(control.sent).toEqual([])
  })

  test('lifecycle events never reach a bridge client', () => {
    const bridge = fakeClient(WS_CHANNEL.bridge)
    wsHandlers.open?.(bridge.ws)

    broadcast(lifecycleEvent)

    expect(bridge.sent).toEqual([])
  })

  test('a disconnected client stops receiving', () => {
    const client = fakeClient(WS_CHANNEL.bridge)
    wsHandlers.open?.(client.ws)
    wsHandlers.close?.(client.ws, 1000, 'gone')

    broadcastToBridge(bridgePush)

    expect(client.sent).toEqual([])
  })

  test('clearWsClients empties both audiences', () => {
    const control = fakeClient(WS_CHANNEL.events)
    const bridge = fakeClient(WS_CHANNEL.bridge)
    wsHandlers.open?.(control.ws)
    wsHandlers.open?.(bridge.ws)

    clearWsClients()
    broadcast(lifecycleEvent)
    broadcastToBridge(bridgePush)

    expect(control.sent).toEqual([])
    expect(bridge.sent).toEqual([])
  })
})
