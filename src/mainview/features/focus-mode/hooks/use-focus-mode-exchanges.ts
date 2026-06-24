import type { MessageDTO } from '@shared/schemas/message.schema'
import React from 'react'
import { useMessages } from '@/features/chat/hooks/use-messages'
import {
  type StreamingMessage,
  streamingToParts,
  useChatStore,
} from '@/features/chat/store/chat.store'
import { type Exchange, groupIntoExchanges } from '../entities/group-into-exchanges'

function makeStreamingAssistant(
  id: string,
  chatId: string,
  parts: ReturnType<typeof streamingToParts>,
): MessageDTO {
  return {
    id,
    chatId,
    role: 'assistant',
    parts,
    modelId: null,
    usage: null,
    createdAt: new Date().toISOString(),
  }
}

// Folds the in-flight streaming message into the committed exchanges so focus
// mode can display a live turn.
//
// (a) Assistant row already committed under this stream id → update it in place.
// (b) Last exchange is a user turn awaiting its response → fill it in place
//     (avoids the duplicate-slide bug when the user message commits before the
//     assistant row exists).
// (c) No committed exchange for this turn yet → synthesise one (timing race).
function mergeStreaming(
  base: Exchange[],
  messages: MessageDTO[],
  streaming: StreamingMessage,
): Exchange[] {
  const streamingParts = streamingToParts(streaming)
  const lastExchange = base[base.length - 1]

  if (lastExchange?.assistantMessage?.id === streaming.id) {
    const updated = [...base]
    updated[updated.length - 1] = {
      ...lastExchange,
      assistantMessage: { ...lastExchange.assistantMessage, parts: streamingParts },
    }
    return updated
  }

  if (lastExchange && !lastExchange.assistantMessage) {
    const updated = [...base]
    updated[updated.length - 1] = {
      ...lastExchange,
      assistantMessage: makeStreamingAssistant(
        streaming.id,
        lastExchange.userMessage.chatId,
        streamingParts,
      ),
    }
    return updated
  }

  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')
  if (!lastUserMsg) return base
  return [
    ...base,
    {
      userMessage: lastUserMsg,
      assistantMessage: makeStreamingAssistant(streaming.id, lastUserMsg.chatId, streamingParts),
    },
  ]
}

/** The current chat's messages grouped into exchanges, with the live stream merged in. */
export function useFocusModeExchanges(): Exchange[] {
  const selectedChatId = useChatStore((s) => s.selectedChatId)
  const streaming = useChatStore((s) => s.streaming)
  const { data: messages = [] } = useMessages(selectedChatId)

  return React.useMemo(() => {
    const base = groupIntoExchanges(messages)
    if (!streaming || streaming.done) return base
    return mergeStreaming(base, messages, streaming)
  }, [messages, streaming])
}
