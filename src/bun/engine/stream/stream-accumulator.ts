import { type MessagePart, PartKind } from '@shared/schemas/message.schema'

export type StreamAccumulator = {
  addText: (text: string) => void
  addReasoning: (text: string) => void
  addSource: (url: string, title?: string) => void
  addToolCall: (toolCallId: string, toolName: string, input: unknown) => void
  addToolResult: (toolCallId: string, toolName: string, output: unknown) => void
  setError: (err: Error) => void
  finish: () => { parts: MessagePart[]; error: Error | null }
}

// Folds the model's stream of deltas into one message. Text and reasoning arrive
// as many small fragments; we coalesce runs of the same kind into a single part
// instead of hundreds of tiny ones. Takes plain domain inputs, never the SDK's
// delta type, so it stays decoupled from the provider and easy to test.
export function createStreamAccumulator(): StreamAccumulator {
  const parts: MessagePart[] = []
  let reasoningStart: number | null = null
  let reasoningEnd: number | null = null
  let error: Error | null = null

  const addText = (text: string) => {
    // First visible text closes the reasoning window if the model was thinking.
    if (reasoningStart !== null && reasoningEnd === null) {
      reasoningEnd = Date.now()
    }

    const last = parts[parts.length - 1]
    if (last?.type === PartKind.enum.text) {
      last.text += text
      return
    }

    parts.push({ type: PartKind.enum.text, text })
  }

  const addReasoning = (text: string) => {
    if (reasoningStart === null) {
      reasoningStart = Date.now()
    }

    const last = parts[parts.length - 1]
    if (last?.type === PartKind.enum.reasoning) {
      last.text += text
      return
    }

    parts.push({ type: PartKind.enum.reasoning, text })
  }

  const addSource = (url: string, title?: string) => {
    parts.push({ type: PartKind.enum.source, url, title })
  }

  const addToolCall = (toolCallId: string, toolName: string, input: unknown) => {
    parts.push({ type: PartKind.enum['tool-call'], toolCallId, toolName, input })
  }

  const addToolResult = (toolCallId: string, toolName: string, output: unknown) => {
    parts.push({ type: PartKind.enum['tool-result'], toolCallId, toolName, output })
  }

  const setError = (err: Error) => {
    error = err
  }

  // Stamp the measured thinking time onto the reasoning part, then hand back the
  // built message plus any error seen mid-stream.
  const finish = (): { parts: MessagePart[]; error: Error | null } => {
    if (reasoningStart !== null) {
      if (reasoningEnd === null) {
        reasoningEnd = Date.now()
      }

      const reasoningPart = parts.find(
        (p): p is Extract<MessagePart, { type: 'reasoning' }> => p.type === PartKind.enum.reasoning,
      )
      if (reasoningPart) {
        reasoningPart.durationMs = reasoningEnd - reasoningStart
      }
    }

    return { parts, error }
  }

  return {
    addText,
    addReasoning,
    addSource,
    addToolCall,
    addToolResult,
    setError,
    finish,
  }
}
