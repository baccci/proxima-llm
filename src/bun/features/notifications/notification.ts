import { Utils } from 'electrobun/bun'

// Show a native desktop notification for a finished turn. Silent by design: the completion-sound
// hook owns audio, so enabling both a notification and a sound does not double up. The OS handles
// Do-Not-Disturb natively. Cross-platform via Electrobun's FFI (no per-OS code here).
export function showTurnNotification(opts: { title: string; body?: string }): void {
  Utils.showNotification({ title: opts.title, body: opts.body, silent: true })
}
