import type { AppRPC, StreamChunk } from '@shared/rpc/app-rpc.types'
import { STREAM_CHUNK_KIND } from '@shared/rpc/stream-chunk'
import { MemoryScope } from '@shared/schemas/memory-slice.schema'
import Electrobun, { Electroview } from 'electrobun/view'
import { queryClient } from './query-client'
import { queryKeys } from './query-keys'
import { playSound } from './sound-player'

// Abort an RPC request to the bun process that has not answered within this window.
const RPC_MAX_REQUEST_MS = 60_000

export type ControlNavigatePayload = AppRPC['webview']['messages']['controlNavigate']

// Internal pub/sub for stream chunks: each streamId maps to its set of callbacks.
const streamSubscribers = new Map<string, Set<(chunk: StreamChunk) => void>>()

// The same pub/sub for control-navigate pushes. Acting on one spans navigation, chat and
// focus mode, which is app/'s call to make, not this transport's, so the policy subscribes
// from there instead of being imported down into here.
const controlNavigateSubscribers = new Set<(payload: ControlNavigatePayload) => void>()

export const rpc = Electroview.defineRPC<AppRPC>({
  maxRequestTime: RPC_MAX_REQUEST_MS,
  handlers: {
    requests: {},
    messages: {
      streamChunk: ({ streamId, chunk }) => {
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
      memoryChanged: ({ scope, projectId }) => {
        queryClient.invalidateQueries({ queryKey: queryKeys.memorySlices(scope, projectId) })
        if (scope === MemoryScope.enum.project && projectId) {
          queryClient.invalidateQueries({ queryKey: queryKeys.memorySummary(projectId) })
        }
      },
      controlNavigate: (payload) => {
        controlNavigateSubscribers.forEach((cb) => cb(payload))
      },
      playSound: ({ sound }) => {
        // A Web Audio failure must never escape into Electrobun's message dispatch.
        // playSound is best-effort already, this is the boundary net.
        try {
          playSound(sound)
        } catch {
          // swallow so a missed cue never breaks message handling
        }
      },
    },
  },
})

export const electroview = new Electrobun.Electroview({ rpc })

// electroview.rpc is typed as optional (Electroview can be built without one), but we
// always pass `rpc` above, so it's present at runtime. Narrow it here so callers get a
// non-nullable request object without sprinkling `?.`/`!` (the latter trips Biome).
export function rpcRequest() {
  const r = electroview.rpc
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
