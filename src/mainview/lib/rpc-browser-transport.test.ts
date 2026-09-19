import { describe, expect, test } from 'bun:test'
import { createBrowserRequests } from './rpc-browser-transport'

const BASE_URL = 'http://127.0.0.1:7865'

const calls: Array<{ url: string; body: unknown }> = []

// A real fetch-shaped function rather than a mock: it records what the transport sent
// and answers with whatever Response the test wants back.
function transportWith(reply: () => Response) {
  calls.length = 0
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) })
    return reply()
  }) as typeof fetch

  return createBrowserRequests({ baseUrl: BASE_URL, fetchImpl })
}

function jsonReply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('createBrowserRequests', () => {
  test('posts the method name and params to the bridge', async () => {
    const requests = transportWith(() => jsonReply({ result: [] }))
    await requests.listProjects({})

    expect(calls).toEqual([
      { url: `${BASE_URL}/rpc`, body: { method: 'listProjects', params: {} } },
    ])
  })

  test('unwraps the result out of the envelope', async () => {
    const requests = transportWith(() => jsonReply({ result: { summary: 'a note' } }))
    expect(await requests.getMemorySummary({ projectId: 'p1' })).toEqual({ summary: 'a note' })
  })

  test('a reply carrying no result resolves to undefined', async () => {
    // Void handlers answer with a bare {}, which has to read as "nothing", not as a
    // parse failure.
    const requests = transportWith(() => jsonReply({}))
    expect(await requests.deleteProject({ id: 'p1' })).toBeUndefined()
  })

  test('an error reply rejects with the message the server gave', async () => {
    const requests = transportWith(() => jsonReply({ error: 'Unknown RPC method: nope' }, 404))
    expect(requests.listProjects({})).rejects.toThrow('Unknown RPC method: nope')
  })

  test('a failure that is not JSON still rejects with something readable', async () => {
    const requests = transportWith(() => new Response('<html>bad gateway</html>', { status: 502 }))
    expect(requests.listProjects({})).rejects.toThrow('502')
  })

  test('the transport is not mistaken for a promise', async () => {
    // Awaiting the object itself would probe for .then, and a proxy that answers every
    // property with a function would turn that into an RPC call named "then".
    const requests = transportWith(() => jsonReply({ result: null }))
    expect((requests as unknown as { then?: unknown }).then).toBeUndefined()
  })
})
