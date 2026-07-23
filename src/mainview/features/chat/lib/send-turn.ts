import { chat } from '@/features/chat/chat.api'
import type { PendingAttachment } from '@/features/chat/hooks/use-pending-attachments'

type SendTurnArgs = {
  chatId: string
  content: string
  modelId: string
  thinking: boolean
  webSearch: boolean
  effort: string | null
  pending: PendingAttachment[]
  flush: (chatId: string) => Promise<string[]>
  clear: () => void
  send: (streamId: string, assistantMessageId: string) => void
}

// The shared tail of sending a turn: upload staged attachments, drop an optimistic
// user message, fire the send RPC, refresh the caches, then attach to the stream.
// Each composer owns its own head (create-a-chat vs an existing chat) and calls this.
export async function sendTurn(args: SendTurnArgs): Promise<void> {
  const { chatId, content, modelId, thinking, webSearch, effort, pending, flush, clear, send } =
    args

  const attachmentIds = await flush(chatId)
  clear()

  chat.addOptimisticUserMessage(
    chatId,
    content,
    pending.map((att, i) => ({ id: attachmentIds[i], kind: att.kind, mediaType: att.mediaType })),
  )

  const { streamId, assistantMessageId } = await chat.sendMessage({
    chatId,
    modelId,
    content,
    thinking,
    webSearch,
    effort,
    attachmentIds,
  })

  chat.invalidateMessages(chatId)
  chat.invalidateList()
  await send(streamId, assistantMessageId)
}
