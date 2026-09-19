import type { AppRPC, StreamChunk } from '@shared/rpc/app-rpc.types'
import { STREAM_CHUNK_KIND } from '@shared/rpc/stream-chunk'
import { MemoryScope } from '@shared/schemas/memory-slice.schema'
import Electrobun, { Electroview } from 'electrobun/view'
import { queryClient } from './query-client'
import { queryKeys } from './query-keys'
import { type BridgePushHandlers, connectBridgePush } from './rpc-browser-push'
import { createBrowserRequests, type RpcRequests } from './rpc-browser-transport'
import { playSound } from './sound-player'

// Abort an RPC request to the bun process that has not answered within this window.
const RPC_MAX_REQUEST_MS = 60_000

// Electrobun's preload injects window.__electrobun before any app code runs. A plain
// browser tab never runs that preload, so its absence is how the renderer knows it is
// the dev browser bridge talking to the control server rather than the desktop window.
const IS_ELECTROBUN_HOST = typeof window !== 'undefined' && '__electrobun' in window

// Where the control server listens. This is the settings default rather than the live
// value, because reading the live one would need the very transport being built here.
const BRIDGE_HOST = '127.0.0.1:7865'
const BRIDGE_BASE_URL = `http://${BRIDGE_HOST}`
const BRIDGE_PUSH_URL = `ws://${BRIDGE_HOST}/bridge`

export type ControlNavigatePayload = AppRPC['webview']['messages']['controlNavigate']

// Internal pub/sub for stream chunks: each streamId maps to its set of callbacks.
const streamSubscribers = new Map<string, Set<(chunk: StreamChunk) => void>>()

// The same pub/sub for control-navigate pushes. Acting on one spans navigation, chat and
// focus mode, which is app/'s call to make, not this transport's, so the policy subscribes
// from there instead of being imported down into here.
const controlNavigateSubscribers = new Set<(payload: ControlNavigatePayload) => void>()

// What the bun process pushes at the renderer, named so both transports can feed the
// same handlers: electrobun dispatches them over its bridge, the browser over a socket.
const webviewMessageHandlers: BridgePushHandlers = {
  streamChunk: ({ streamId, chunk }: AppRPC['webview']['messages']['streamChunk']) => {
    streamSubscribers.get(streamId)?.forEach((cb) => cb(chunk))
    if (chunk.kind === STREAM_CHUNK_KIND.done || chunk.kind === STREAM_CHUNK_KIND.error) {
      streamSubscribers.delete(streamId)
    }
  },
  modelsUpdated: () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.models() })
    queryClient.invalidateQueries({ queryKey: queryKeys.modelSyncInfo() })
  },
  chatsUpdated: () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.chatsAll() })
  },
  memoryChanged: ({ scope, projectId }: AppRPC['webview']['messages']['memoryChanged']) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.memorySlices(scope, projectId) })
    if (scope === MemoryScope.enum.project && projectId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.memorySummary(projectId) })
    }
  },
  controlNavigate: (payload: ControlNavigatePayload) => {
    controlNavigateSubscribers.forEach((cb) => cb(payload))
  },
  playSound: ({ sound }: AppRPC['webview']['messages']['playSound']) => {
    // A Web Audio failure must never escape into Electrobun's message dispatch.
    // playSound is best-effort already, this is the boundary net.
    try {
      playSound(sound)
    } catch {
      // swallow so a missed cue never breaks message handling
    }
  },
}

const rpc = Electroview.defineRPC<AppRPC>({
  maxRequestTime: RPC_MAX_REQUEST_MS,
  handlers: {
    requests: {},
    messages: webviewMessageHandlers,
  },
})

// Constructing an Electroview assigns to window.__electrobun, which only the preload
// creates, so it throws outright in a plain tab. The browser path must never build one.
const electroview = IS_ELECTROBUN_HOST ? new Electrobun.Electroview({ rpc }) : null

const browserRequests = IS_ELECTROBUN_HOST
  ? null
  : createBrowserRequests({
      baseUrl: BRIDGE_BASE_URL,
      fetchImpl: globalThis.fetch.bind(globalThis),
    })

// The push half of the browser bridge. Electrobun delivers these over its own transport
// in the desktop window, so the socket is opened only when that transport is absent.
if (!IS_ELECTROBUN_HOST) {
  connectBridgePush(BRIDGE_PUSH_URL, webviewMessageHandlers)
}

// The one seam every call site goes through. Which transport answers depends on where
// the renderer is running, and nothing above this line needs to know which.
export function rpcRequest(): RpcRequests {
  if (browserRequests) {
    return browserRequests
  }

  // electroview.rpc is typed as optional (Electroview can be built without one), but we
  // always pass `rpc` above, so it's present at runtime. Narrow it here so callers get a
  // non-nullable request object without sprinkling `?.`/`!` (the latter trips Biome).
  const r = electroview?.rpc
  if (!r) {
    throw new Error('RPC transport not initialised')
  }

  return r.request
}

export function subscribeToStream(streamId: string, cb: (chunk: StreamChunk) => void): () => void {
  if (!streamSubscribers.has(streamId)) {
    streamSubscribers.set(streamId, new Set())
  }
  streamSubscribers.get(streamId)?.add(cb)
  return () => streamSubscribers.get(streamId)?.delete(cb)
}

export function subscribeToControlNavigate(
  cb: (payload: ControlNavigatePayload) => void,
): () => void {
  controlNavigateSubscribers.add(cb)
  return () => controlNavigateSubscribers.delete(cb)
}
