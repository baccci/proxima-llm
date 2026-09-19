import { describe, expect, test } from 'bun:test'
import { dispatchRpcCall } from './rpc-dispatch'

// A stand-in for the app's real handler table. These are ordinary functions rather than
// mocks: the dispatcher's whole job is to find one by name and call it, so real functions
// are what proves it did.
const handlers = {
  echo: (params: { value: string }) => ({ echoed: params.value }),
  slowEcho: async (params: { value: string }) => {
    await Bun.sleep(1)
    return { echoed: params.value }
  },
  returnsNothing: () => {},
  explodes: () => {
    throw new Error('handler blew up')
  },
  explodesAsync: async () => {
    throw new Error('async handler blew up')
  },
}

describe('dispatchRpcCall', () => {
  test('calls the named handler with the posted params', async () => {
    const dispatched = await dispatchRpcCall({ method: 'echo', params: { value: 'hi' } }, handlers)
    expect(dispatched).toEqual({ ok: true, payload: { result: { echoed: 'hi' } } })
  })

  test('awaits a handler that returns a promise', async () => {
    const dispatched = await dispatchRpcCall(
      { method: 'slowEcho', params: { value: 'hi' } },
      handlers,
    )
    expect(dispatched).toEqual({ ok: true, payload: { result: { echoed: 'hi' } } })
  })

  test('a handler that returns nothing still serialises to a parseable body', async () => {
    const dispatched = await dispatchRpcCall({ method: 'returnsNothing' }, handlers)
    if (!dispatched.ok) {
      throw new Error('expected the call to succeed')
    }

    // JSON.stringify(undefined) is undefined, which would leave the caller an empty HTTP
    // body to parse. The envelope is what keeps a void handler's reply valid JSON.
    expect(JSON.parse(JSON.stringify(dispatched.payload))).toEqual({})
  })

  test('an unknown method is rejected as not found', async () => {
    const dispatched = await dispatchRpcCall({ method: 'nope', params: {} }, handlers)
    expect(dispatched).toEqual({ ok: false, status: 404, message: 'Unknown RPC method: nope' })
  })

  // A plain object inherits from Object.prototype, so a bare `handlers[method]` lookup
  // finds toString, constructor and friends, and they are all callable.
  test('a method name inherited from Object.prototype is not callable', async () => {
    const dispatched = await dispatchRpcCall({ method: 'toString' }, handlers)
    expect(dispatched).toEqual({ ok: false, status: 404, message: 'Unknown RPC method: toString' })
  })

  test('a body with no method is rejected as a bad request', async () => {
    const dispatched = await dispatchRpcCall({ params: {} }, handlers)
    expect(dispatched).toEqual({ ok: false, status: 400, message: 'Invalid RPC envelope' })
  })

  test('a handler that throws becomes a failure carrying its message', async () => {
    const dispatched = await dispatchRpcCall({ method: 'explodes' }, handlers)
    expect(dispatched).toEqual({ ok: false, status: 500, message: 'handler blew up' })
  })

  test('a handler whose promise rejects becomes a failure too', async () => {
    const dispatched = await dispatchRpcCall({ method: 'explodesAsync' }, handlers)
    expect(dispatched).toEqual({ ok: false, status: 500, message: 'async handler blew up' })
  })
})
