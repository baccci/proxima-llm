import { COMPACT_NOOP_REASON, COMPACT_STATUS, type CompactResult } from '@shared/rpc/compact-result'
import React from 'react'
import { chat } from '@/features/chat/chat.api'
import { useChatStore } from '@/features/chat/store/chat.store'
import { errorMessage } from '@/utils/error-message'

// How long the post-compaction note stays on screen.
const NOTE_TIMEOUT_MS = 4000

// Turn a compaction result into the note we show the user.
function compactionNote(result: CompactResult): string {
  if (result.status === COMPACT_STATUS.ok) {
    const n = result.summarized
    return `Summarized ${n} earlier message${n === 1 ? '' : 's'} to save context`
  }

  const noopMessages: Record<string, string> = {
    [COMPACT_NOOP_REASON.nothingToSummarize]: 'Already compact — nothing older to summarize',
    [COMPACT_NOOP_REASON.noTitleModel]: 'No model available to summarize',
  }
  return noopMessages[result.reason] ?? 'Compaction produced no summary'
}

// Manual "compact now" action for a chat: runs the compaction RPC and surfaces a
// short-lived note with the outcome. The read-side info lives in useCompaction.
export function useCompactNow(chatId: string) {
  const [isCompacting, setIsCompacting] = React.useState(false)
  const [note, setNote] = React.useState<string | null>(null)
  const setCompactingChatId = useChatStore((s) => s.setCompactingChatId)

  async function compact() {
    if (isCompacting) {
      return
    }

    setIsCompacting(true)
    setNote(null)
    setCompactingChatId(chatId)

    const showNote = (msg: string) => {
      setNote(msg)
      window.setTimeout(() => setNote(null), NOTE_TIMEOUT_MS)
    }

    try {
      const result = await chat.compactNow(chatId)
      showNote(compactionNote(result))
    } catch (err) {
      showNote(errorMessage(err, 'Compaction failed'))
    } finally {
      setIsCompacting(false)
      setCompactingChatId(null)
    }
  }

  return { isCompacting, note, compact }
}
