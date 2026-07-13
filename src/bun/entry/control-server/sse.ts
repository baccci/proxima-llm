import { STREAM_CHUNK_KIND } from '../../../shared-contracts/rpc/stream-chunk';
import { startChatStream } from '../../engine/chat-stream/chat-stream.service';
import { broadcast, LIFECYCLE_KIND } from './events';

interface CompletionsParams {
  chatId: string;
  modelId: string;
  content: string;
  thinking: boolean;
}

// Build an SSE Response that streams a chat completion back to the caller, chunk by
// chunk, while the same run also renders in-app. If the caller disconnects, a closed
// flag stops the writes but the in-app run keeps going (it is persisted there anyway).
export function streamCompletionsResponse(params: CompletionsParams): Response {
  const { chatId, modelId, content, thinking } = params;

  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();

      const send = (data: unknown) => {
        if (closed) {
          return;
        }

        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Consumer disconnected, so stop writing and let the in-app run finish.
          closed = true;
        }
      };

      // First frame tells the caller its request landed; the stream chunks follow.
      send({ kind: 'accepted', chatId });

      const { streamId } = startChatStream(
        { chatId, modelId, content, thinking },
        {
          onChunk: (chunk) => {
            send(chunk);
            if (chunk.kind === STREAM_CHUNK_KIND.done || chunk.kind === STREAM_CHUNK_KIND.error) {
              closed = true;
              controller.close();
            }
          },
          onLifecycle: (event, meta) =>
            broadcast({ event, chatId: meta.chatId, streamId: meta.streamId }),
        },
      );

      broadcast({ event: LIFECYCLE_KIND.accepted, chatId, streamId });
    },
    cancel() {
      // Client went away mid-stream; stop writing. The model run continues in-app.
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  });
}
