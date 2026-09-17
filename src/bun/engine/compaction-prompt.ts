import { type MessageDTO, MessageRole, PartKind } from '@shared/schemas/message.schema'

// Render the summary prompt a compaction run sends to the cheap model: any prior
// summary first, then the turns to summarize as plain User/Assistant text lines.
// Pure (no DB or model calls), so it lives in a leaf and stays testable without
// dragging the service's IO graph.
export function buildCompactionPrompt(
  previousSummary: string | undefined,
  messages: MessageDTO[],
): string {
  const lines: string[] = []

  if (previousSummary) {
    lines.push('## Previous conversation summary')
    lines.push(previousSummary)
    lines.push('')
  }

  lines.push('## Conversation turns to summarize')

  for (const m of messages) {
    const role = m.role === MessageRole.enum.user ? 'User' : 'Assistant'
    const text = m.parts
      .filter(
        (p): p is Extract<MessageDTO['parts'][number], { type: 'text' }> =>
          p.type === PartKind.enum.text,
      )
      .map((p) => p.text)
      .join(' ')

    // Skip turns with no text (a tool-only or empty turn adds no summary signal).
    if (text) {
      lines.push(`${role}: ${text}`)
    }
  }

  lines.push('')
  lines.push(
    'Write a dense summary of this conversation (incorporating any prior summary). Preserve all key decisions, facts, and context. Be thorough but concise.',
  )

  return lines.join('\n')
}
