// Anthropic model families, ordered most to least capable. Drives the renderer
// sort and the cheap-model fallback. `family` on ModelDTO stays an open string
// because OpenRouter vendor prefixes are arbitrary; this const is only the fixed
// Anthropic set.
export const ANTHROPIC_FAMILIES = ['opus', 'sonnet', 'haiku'] as const

export type AnthropicFamily = (typeof ANTHROPIC_FAMILIES)[number]
