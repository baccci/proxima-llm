import React from 'react'
import {
  computeFontWeight,
  computeLineHeight,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
} from '../helpers/typography'

/**
 * Fits text to the available viewport height by binary-searching the largest
 * font size at which the single-column content block fits. Two-column layout is
 * only activated when even the minimum font (16px) overflows one column, so
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
    if (!el) {
      return
    }

    // Reset to single-column before measuring. The DOM may still have columns-2
    // from the previous resetKey. setTwoColumn(false) triggers a synchronous
    // re-render that commits before the ResizeObserver's initial callback fires,
    // so check() always sees a clean single-column layout.
    setFontSize(FONT_SIZE_MAX)
    setTwoColumn(false)
    lockedRef.current = false

    const check = () => {
      if (lockedRef.current) {
        return
      }
      const inner = ref.current
      if (!inner) {
        return
      }
      const availableHeight = inner.parentElement?.clientHeight ?? inner.clientHeight
      if (availableHeight === 0) {
        return
      }

      // Imperatively apply a candidate size and read scrollHeight to force a
      // synchronous reflow, the only way to measure candidate sizes without a
      // React render per step. The imperative style is replaced by the committed
      // React state (via the inline style prop on this element) after setState
      // resolves. line-height AND weight must be set too, not just fontSize:
      // the committed render derives both from fontSize (computeLineHeight ramps
      // 1.65→1.2 across the range, weight shifts glyph width), so measuring with
      // only fontSize reads scrollHeight against the previous size's line-height.
      // That makes the fit and the real render disagree, so the observer keeps
      // re-firing and the size oscillates between two values (visible flicker).
      const apply = (px: number) => {
        inner.style.fontSize = `${px}px`
        inner.style.lineHeight = `${computeLineHeight(px)}`
        inner.style.fontWeight = `${computeFontWeight(px)}`
      }
      const fits = (px: number) => {
        apply(px)
        return inner.scrollHeight <= availableHeight
      }

      if (fits(FONT_SIZE_MAX)) {
        setFontSize(FONT_SIZE_MAX)
        setTwoColumn(false)
        return
      }
      if (!fits(FONT_SIZE_MIN)) {
        // Even the minimum font overflows one column → two columns. apply() has
        // already committed the min size imperatively.
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
        if (fits(mid)) {
          lo = mid
          continue
        }
        hi = mid - 1
      }
      // Apply the resolved size imperatively so there is no flash between now and
      // the React commit that applies it via the inline style prop.
      apply(lo)
      setFontSize(lo)
      setTwoColumn(false)
    }

    const observer = new ResizeObserver(check)
    observer.observe(el)
    // Also observe the scroll-container parent so window resizes re-trigger a fit.
    if (el.parentElement) {
      observer.observe(el.parentElement)
    }
    return () => observer.disconnect()
  }, [resetKey])

  return { ref, fontSize, twoColumn }
}
