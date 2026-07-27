// The bundled sound cues the renderer can synthesize. A catalog action names one; the renderer
// generates the tone. A fixed set keeps an agent/imported config from naming an unknown sound.
export const SOUND_ID = {
  completion: 'completion',
  error: 'error',
  approval: 'approval',
} as const

export type SoundId = (typeof SOUND_ID)[keyof typeof SOUND_ID]
