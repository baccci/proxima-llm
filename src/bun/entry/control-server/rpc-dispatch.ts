import { z } from 'zod'
import { toErrorMessage } from '../../utils/to-error'

// The envelope a browser client posts to /rpc. Only the method name is checked here.
// Params are handed to the handler untouched, which is the same trust the app's own
// window gets over the RPC bridge, and the reason the route is dev-only.
const RpcEnvelope = z.object({
  method: z.string(),
  params: z.unknown().optional(),
})

// A table of handlers keyed by method name. Typing the parameter as `never` is what
// lets handlers of many different param shapes satisfy one signature.
type RpcHandler = (params: never) => unknown
export type RpcHandlerTable = Record<string, RpcHandler>

// Either the handler's return value, wrapped so the caller always gets an object, or
// the status and message the route should answer with.
export type RpcDispatchResult =
  | { ok: true; payload: { result: unknown } }
  | { ok: false; status: number; message: string }

// Look up one RPC method by name and call it. Knows nothing about HTTP, so the route
// decides how to dress the outcome up as a response.
export async function dispatchRpcCall(
  raw: unknown,
  handlers: RpcHandlerTable,
): Promise<RpcDispatchResult> {
  const parsed = RpcEnvelope.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, status: 400, message: 'Invalid RPC envelope' }
  }

  const { method, params } = parsed.data
  // An own-property check, not a bare lookup: a plain object inherits toString and
  // constructor from Object.prototype, and a bare lookup would happily call one of those.
  // biome-ignore lint/suspicious/noPrototypeBuiltins: Object.hasOwn needs lib es2022
  const isOwnMethod = Object.prototype.hasOwnProperty.call(handlers, method)
  const handler = isOwnMethod ? handlers[method] : undefined
  if (!handler) {
    return { ok: false, status: 404, message: `Unknown RPC method: ${method}` }
  }

  // The one cast in the path: each handler declares its own params shape and the wire
  // hands over an unknown, so the two only meet here.
  const call = handler as (params: unknown) => unknown

  try {
    return { ok: true, payload: { result: await call(params) } }
  } catch (e) {
    return { ok: false, status: 500, message: toErrorMessage(e) }
  }
}
