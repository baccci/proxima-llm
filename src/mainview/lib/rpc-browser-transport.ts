import type { AppRPC } from '@shared/rpc/app-rpc.types'

// The renderer's view of the bun process: one async function per RPC method. Electrobun
// builds the same shape over its own bridge, so the call sites cannot tell which
// transport answered them.
export type RpcRequests = {
  [M in keyof AppRPC['bun']['requests']]: (
    params: AppRPC['bun']['requests'][M]['params'],
  ) => Promise<AppRPC['bun']['requests'][M]['response']>
}

type BrowserTransportDeps = {
  // Where the control server listens, origin only, no trailing slash.
  baseUrl: string
  // Injected so the transport can be exercised without a server behind it.
  fetchImpl: typeof fetch
}

// Build the request surface on top of POST /rpc. Every property access becomes a call
// to that one endpoint with the method name in the envelope, which is what lets the
// browser reuse the desktop app's own RPC contract untouched.
export function createBrowserRequests({ baseUrl, fetchImpl }: BrowserTransportDeps): RpcRequests {
  return new Proxy({} as RpcRequests, {
    get(_target, property) {
      // A symbol, or `then`, means something is inspecting this object rather than
      // calling a method on it. Answering with a function would make it look like a
      // promise, and awaiting it would fire an RPC call named "then".
      if (typeof property !== 'string' || property === 'then') {
        return undefined
      }

      return (params: unknown) => callBridge(baseUrl, fetchImpl, property, params)
    },
  })
}

async function callBridge(
  baseUrl: string,
  fetchImpl: typeof fetch,
  method: string,
  params: unknown,
): Promise<unknown> {
  const response = await fetchImpl(`${baseUrl}/rpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, params: params ?? {} }),
  })

  if (!response.ok) {
    throw new Error(await bridgeErrorMessage(response, method))
  }

  const body = (await response.json()) as { result?: unknown }
  return body.result
}

// The route answers failures as { error }, but a crash in front of it (or no server at
// all) will not, so fall back to naming the method and the status.
async function bridgeErrorMessage(response: Response, method: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null
  return body?.error ?? `RPC ${method} failed with status ${response.status}`
}
