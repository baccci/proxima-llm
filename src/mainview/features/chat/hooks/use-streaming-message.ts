import React from 'react'
import { attachToStream } from '@/features/chat/lib/attach-stream'
import { useChatStore } from '@/features/chat/store/chat.store'
import { rpcRequest } from '@/lib/rpc.client'

export function useStreamingMessage(chatId: string | null) {
  const streaming = useChatStore((s) => s.streaming)

  const send = React.useCallback(
    (streamId: string, assistantMessageId: string) => {
      return attachToStream(streamId, assistantMessageId, chatId ?? '')
    },
    [chatId],
  )

  function resolveApproval(
    streamId: string,
    toolCallId: string,
    decision: 'allow' | 'deny',
    remember: boolean,
  ) {
    rpcRequest().resolveToolApproval({ streamId, toolCallId, decision, remember })
  }

  return { streaming, send, resolveApproval }
}
