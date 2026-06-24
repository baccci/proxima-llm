import React from 'react'

const FONT_SIZE_MAX = 90
const FONT_SIZE_MIN = 16

/**
 * Fits text to the available viewport height by binary-searching the largest
 * font size at which the single-column content block fits. Two-column layout is
 * only activated when even the minimum font (16px) overflows one column — so
 * columns are reserved for genuinely long responses at the font floor.
 *
 * Returns a ref to attach to the inner content block, the resolved fontSize,
 * and the twoColumn flag. Drive line-height/weight from the returned fontSize
 * via computeLineHeight/computeFontWeight.
 *
 * Uses useLayoutEffect deliberately: the decision depends on real rendered
 * scrollHeight, which can only be read after layout and not derived from props.
 */
export function useFitTypography(resetKey: unknown) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [fontSize, setFontSize] = React.useState(FONT_SIZE_MAX)
  const [twoColumn, setTwoColumn] = React.useState(false)
  // Once two-column is committed for a given resetKey, lock it: switching to
  // two columns halves the element height, which would otherwise re-trigger
  // single-column refitting and cause oscillation.
  const lockedRef = React.useRef(false)

  // biome-ignore lint/correctness/useExhaustiveDependencies: resetKey is the intended re-measure trigger
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    // Reset to single-column before measuring. The DOM may still have columns-2
    // from the previous resetKey. setTwoColumn(false) triggers a synchronous
    // re-render that commits before the ResizeObserver's initial callback fires,
    // so check() always sees a clean single-column layout.
    setFontSize(FONT_SIZE_MAX)
    setTwoColumn(false)
    lockedRef.current = false

    const check = () => {
      if (lockedRef.current) return
      const inner = ref.current
      if (!inner) return
      const H = inner.parentElement?.clientHeight ?? inner.clientHeight
      if (H === 0) return

      // Imperatively set fontSize and read scrollHeight to force a synchronous
      // reflow — the only way to measure candidate sizes without a React render
      // per step. The imperative style is replaced by the committed React state
      // (via the inline style prop on this element) after setState resolves.
      const fits = (px: number) => {
        inner.style.fontSize = `${px}px`
        return inner.scrollHeight <= H
      }

      if (fits(FONT_SIZE_MAX)) {
        setFontSize(FONT_SIZE_MAX)
        setTwoColumn(false)
        return
      }
      if (!fits(FONT_SIZE_MIN)) {
        // Even the minimum font overflows one column → two columns.
        inner.style.fontSize = `${FONT_SIZE_MIN}px`
        lockedRef.current = true
        setFontSize(FONT_SIZE_MIN)
        setTwoColumn(true)
        return
      }
      // fits(MAX)=false, fits(MIN)=true → binary-search [MIN, MAX-1] (~7 iterations).
      let lo = FONT_SIZE_MIN
      let hi = FONT_SIZE_MAX - 1
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2)
        if (fits(mid)) lo = mid
        else hi = mid - 1
      }
      // Set the resolved size imperatively so there is no flash between now and
      // the React commit that applies it via the inline style prop.
      inner.style.fontSize = `${lo}px`
      setFontSize(lo)
      setTwoColumn(false)
    }

    const observer = new ResizeObserver(check)
    observer.observe(el)
    // Also observe the scroll-container parent so window resizes re-trigger a fit.
    if (el.parentElement) observer.observe(el.parentElement)
    return () => observer.disconnect()
  }, [resetKey])

  return { ref, fontSize, twoColumn }
}
