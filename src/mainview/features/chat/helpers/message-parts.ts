import { type MessagePart, PartKind } from '@shared/schemas/message.schema'

export function extractReasoning(parts: MessagePart[]): string | null {
  const p = parts.find((p) => p.type === PartKind.enum.reasoning)
  return p?.type === PartKind.enum.reasoning ? p.text : null
}

export function extractReasoningPart(
  parts: MessagePart[],
): Extract<MessagePart, { type: 'reasoning' }> | null {
  const p = parts.find((p) => p.type === PartKind.enum.reasoning)
  return p?.type === PartKind.enum.reasoning ? p : null
}

export function extractTextParts(parts: MessagePart[]): MessagePart[] {
  return parts.filter((p) => p.type !== PartKind.enum.reasoning && p.type !== PartKind.enum.source)
}

export function extractSourceParts(
  parts: MessagePart[],
): Extract<MessagePart, { type: 'source' }>[] {
  return parts.filter(
    (p): p is Extract<MessagePart, { type: 'source' }> => p.type === PartKind.enum.source,
  )
}
