import { type MessagePart, PartKind } from '@shared/schemas/message.schema'

export function messageToText(parts: MessagePart[]): string {
  return parts
    .filter((p): p is Extract<MessagePart, { type: 'text' }> => p.type === PartKind.enum.text)
    .map((p) => p.text)
    .join('\n\n')
}

export function copyMessage(parts: MessagePart[]): Promise<void> {
  return navigator.clipboard.writeText(messageToText(parts))
}
