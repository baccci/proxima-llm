import React from 'react'

/**
 * Runs an effect once, on mount, with optional cleanup on unmount.
 *
 * A named wrapper around the single legitimate use of an empty dependency array:
 * synchronizing with an external system for the lifetime of the component. Prefer
 * this — together with conditional mounting at the parent — over effects that
 * guard on changing dependencies.
 */
export function useMountEffect(effect: React.EffectCallback) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only by design
  React.useEffect(effect, [])
}
