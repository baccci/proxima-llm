import type { TextStreamPart, ToolSet } from 'ai'
import type { StreamChunk } from '../../../shared-contracts/rpc/app-rpc.types'
import { STREAM_CHUNK_KIND } from '../../../shared-contracts/rpc/stream-chunk'
import { toError } from '../../utils/to-error'
import type { StreamAccumulator } from './stream-accumulator'

type ConsumeDeps = {
  onChunk: (chunk: StreamChunk) => void
  acc: StreamAccumulator
  onActivity: () => void
}

// Drain the SDK's delta stream. Each delta does two things: emit a live chunk to
// the renderer (onChunk) and fold into the accumulator (acc). onActivity fires
// once per delta so the caller can poke its idle guard; this loop stays unaware
// of timeouts. The switch reads the SDK's own delta.type vocabulary, so those
// tags stay bare (R27 exclusion: foreign shapes); our chunk kinds go through
// STREAM_CHUNK_KIND.
export async function consumeStream(
  stream: AsyncIterable<TextStreamPart<ToolSet>>,
  { onChunk, acc, onActivity }: ConsumeDeps,
): Promise<void> {
  for await (const delta of stream) {
    onActivity()

    switch (delta.type) {
      case 'text-delta':
        onChunk({ kind: STREAM_CHUNK_KIND.textDelta, delta: delta.text })
        acc.addText(delta.text)
        break
      case 'reasoning-delta':
        onChunk({ kind: STREAM_CHUNK_KIND.reasoningDelta, delta: delta.text })
        acc.addReasoning(delta.text)
        break
      case 'source':
        if (delta.sourceType === 'url') {
          onChunk({ kind: STREAM_CHUNK_KIND.source, url: delta.url, title: delta.title })
          acc.addSource(delta.url, delta.title)
        }
        break
      case 'tool-call': {
        const toolName = String(delta.toolName)
        onChunk({
          kind: STREAM_CHUNK_KIND.toolCall,
          toolCallId: delta.toolCallId,
          toolName,
          input: delta.input,
        })
        acc.addToolCall(delta.toolCallId, toolName, delta.input)
        break
      }
      case 'tool-result':
        onChunk({
          kind: STREAM_CHUNK_KIND.toolResult,
          toolCallId: delta.toolCallId,
          output: delta.output,
        })
        acc.addToolResult(delta.toolCallId, String(delta.toolName), delta.output)
        break
      case 'error':
        acc.setError(toError(delta.error))
        break
    }
  }
}
