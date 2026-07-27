import { SOUND_ID, type SoundId } from '@shared/lifecycle/sound'

// A single shared AudioContext, created lazily. WKWebView blocks audio until a user gesture, so
// we resume the context on the first pointerdown and then stop listening.
let ctx: AudioContext | null = null

function audioContext(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext()
  }
  return ctx
}

function unlock() {
  // Remove first so a thrown or rejected resume cannot leave us re-firing on every pointerdown.
  window.removeEventListener('pointerdown', unlock)
  try {
    void audioContext().resume()
  } catch {
    // best-effort unlock, a blocked context just means the first cue may be silent
  }
}

window.addEventListener('pointerdown', unlock)

// One enveloped sine tone. The short attack/decay keeps it a soft blip rather than a click.
function tone(freq: number, startAt: number, durationS: number, peakGain: number) {
  const c = audioContext()
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0, startAt)
  gain.gain.linearRampToValueAtTime(peakGain, startAt + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + durationS)
  osc.connect(gain)
  gain.connect(c.destination)
  osc.start(startAt)
  osc.stop(startAt + durationS)
}

// Completion: a gentle rising two-note bell. Approval: a soft double tap. Error: a single lower,
// longer tone.
// Audio is best-effort. WKWebView can refuse to build or resume an AudioContext, so any
// Web Audio failure is swallowed here rather than thrown back at the caller.
export function playSound(sound: SoundId): void {
  try {
    const now = audioContext().currentTime
    if (sound === SOUND_ID.completion) {
      tone(660, now, 0.14, 0.14)
      tone(880, now + 0.1, 0.18, 0.14)
      return
    }
    if (sound === SOUND_ID.approval) {
      // A soft double tap, "your input is needed", distinct from the bell and the error tone.
      tone(520, now, 0.12, 0.12)
      tone(520, now + 0.16, 0.14, 0.12)
      return
    }
    tone(300, now, 0.28, 0.16)
  } catch {
    // best-effort cue, never let an audio error reach the caller
  }
}
