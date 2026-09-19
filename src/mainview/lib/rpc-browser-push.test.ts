import { describe, expect, test } from 'bun:test'
import { type BridgePushHandlers, dispatchBridgePush } from './rpc-browser-push'

// Real recording functions standing in for the app's message handlers, so a routed push
// is proved by the payload that actually arrived.
function recordingHandlers() {
  const received: Array<{ channel: string; payload: unknown }> = []
  const record = (channel: string) => (payload: unknown) => {
    received.push({ channel, payload })
  }

  const handlers = {
    streamChunk: record('streamChunk'),
    modelsUpdated: record('modelsUpdated'),
    chatsUpdated: record('chatsUpdated'),
    memoryChanged: record('memoryChanged'),
    controlNavigate: record('controlNavigate'),
    playSound: record('playSound'),
  } as unknown as BridgePushHandlers

  return { handlers, received }
}

describe('dispatchBridgePush', () => {
  test('routes a push to the handler for its channel, payload intact', () => {
    const { handlers, received } = recordingHandlers()

    dispatchBridgePush(
      JSON.stringify({ channel: 'playSound', payload: { sound: 'complete' } }),
      handlers,
    )

    expect(received).toEqual([{ channel: 'playSound', payload: { sound: 'complete' } }])
  })

  test('ignores a push naming a channel that does not exist', () => {
    const { handlers, received } = recordingHandlers()

    dispatchBridgePush(JSON.stringify({ channel: 'somethingElse', payload: {} }), handlers)

    expect(received).toEqual([])
  })

  test('ignores a channel inherited from Object.prototype', () => {
    const { handlers, received } = recordingHandlers()

    dispatchBridgePush(JSON.stringify({ channel: 'toString', payload: {} }), handlers)

    expect(received).toEqual([])
  })

  test('ignores a frame that is not valid JSON', () => {
    const { handlers, received } = recordingHandlers()

    expect(() => dispatchBridgePush('not json at all', handlers)).not.toThrow()
    expect(received).toEqual([])
  })

  test('ignores a frame carrying no channel', () => {
    const { handlers, received } = recordingHandlers()

    dispatchBridgePush(JSON.stringify({ payload: { sound: 'complete' } }), handlers)

    expect(received).toEqual([])
  })
})
