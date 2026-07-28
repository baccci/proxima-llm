import type { SoundId } from '../../../shared-contracts/lifecycle/sound'

// The bun → renderer push for a synthesized sound. The sender is injected once in index.ts
// (wireWebviewPush), same shape as the other webview senders; the turn passes pushPlaySound into
// the turn-done/turn-error contexts so an action never imports the webview transport.
type PlaySoundSender = (sound: SoundId) => void

let send: PlaySoundSender | null = null

export function setSendPlaySound(fn: PlaySoundSender): void {
  send = fn
}

export function pushPlaySound(sound: SoundId): void {
  send?.(sound)
}
