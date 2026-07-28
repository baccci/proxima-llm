import { z } from 'zod'

// How a model row entered the database, and which subsystem may overwrite it.
// anthropic and openrouter each come from their provider's catalog sync and own their
// own rows. builtin is a legacy value: the old hardcoded Anthropic seed wrote it, and a
// one-time migration converts those rows to anthropic. Nothing writes builtin anymore.
export const ModelSource = z.enum(['builtin', 'anthropic', 'openrouter'])
export type ModelSource = z.infer<typeof ModelSource>
