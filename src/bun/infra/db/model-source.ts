import { z } from 'zod'

// How a model row entered the database, and which subsystem may overwrite it.
// builtin comes from the models we ship in code (seed). openrouter comes from the
// OpenRouter catalog sync.
export const ModelSource = z.enum(['builtin', 'openrouter'])
export type ModelSource = z.infer<typeof ModelSource>
