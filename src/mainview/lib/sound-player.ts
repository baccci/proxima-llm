import type { SoundId } from '@shared/lifecycle/sound'

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
  void audioContext().resume()
  window.removeEventListener('pointerdown', unlock)
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

// Completion: a gentle rising two-note bell. Error: a single lower, longer tone.
export function playSound(sound: SoundId): void {
  const now = audioContext().currentTime
  if (sound === 'completion') {
    tone(660, now, 0.14, 0.14)
    tone(880, now + 0.1, 0.18, 0.14)
  } else {
    tone(300, now, 0.28, 0.16)
  }
}
