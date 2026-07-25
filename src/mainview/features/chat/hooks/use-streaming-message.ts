import React from 'react'
import { attachToStream } from '@/features/chat/lib/attach-stream'
import { useChatStore } from '@/features/chat/store/chat.store'

export function useStreamingMessage(chatId: string | null) {
  const streaming = useChatStore((s) => s.streaming)

  const send = React.useCallback(
    (streamId: string, assistantMessageId: string) => {
      return attachToStream(streamId, assistantMessageId, chatId ?? '')
    },
    [chatId],
  )

  return { streaming, send }
}
