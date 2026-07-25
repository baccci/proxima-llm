import type { ChatDTO } from '@shared/schemas/chat.schema'
import type { MessagePart } from '@shared/schemas/message.schema'
import { chat } from '@/features/chat/chat.api'
import { attachToStream } from '@/features/chat/lib/attach-stream'
import { copyMessage } from '@/features/chat/lib/copy-message'
import { useChatStore } from '@/features/chat/store/chat.store'

export function useMessageActions(chatItem: ChatDTO) {
  const streaming = useChatStore((s) => s.streaming)
  const isStreamingActive = !!streaming && !streaming.done

  async function retry(userMessageId: string) {
    if (isStreamingActive) {
      return
    }
    const modelId = chatItem.modelId
    if (!modelId) {
      return
    }

    const { streamId, assistantMessageId } = await chat.retryFromMessage({
      chatId: chatItem.id,
      modelId,
      userMessageId,
      thinking: chatItem.composer.thinking,
      webSearch: chatItem.composer.webSearch,
    })

    chat.invalidateMessages(chatItem.id)
    attachToStream(streamId, assistantMessageId, chatItem.id)
  }

  async function saveEdit(userMessageId: string, content: string) {
    if (isStreamingActive) {
      return
    }
    const modelId = chatItem.modelId
    if (!modelId) {
      return
    }

    const { streamId, assistantMessageId } = await chat.retryFromMessage({
      chatId: chatItem.id,
      modelId,
      userMessageId,
      content,
      thinking: chatItem.composer.thinking,
      webSearch: chatItem.composer.webSearch,
    })

    chat.invalidateMessages(chatItem.id)
    attachToStream(streamId, assistantMessageId, chatItem.id)
  }

  function copy(parts: MessagePart[]) {
    return copyMessage(parts)
  }

  return { retry, saveEdit, copy, isStreamingActive }
}
