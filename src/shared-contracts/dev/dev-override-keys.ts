import { z } from 'zod'

// Runtime knobs the dev-tools panel (TWEAK=1 only) can pin to force behavior. The
// renderer sends one of these keys to devSetOverride and the bun side reads it back
// with the same key, so they are a cross-process contract: single-source them here
// so the two sides can never drift out of sync.
export const DevOverrideKey = z.enum(['forcedContextTokens', 'compactionRatio'])
export type DevOverrideKey = z.infer<typeof DevOverrideKey>
