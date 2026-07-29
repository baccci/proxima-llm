import React from 'react'

type LoadMoreArgs = {
  // Index of the last row the virtualizer currently has mounted.
  lastVisibleIndex: number
  rowCount: number
  hasNextPage: boolean
  isFetchingNextPage: boolean
  fetchNextPage: () => void
  // How many rows from the end to start fetching the next page.
  threshold: number
}

// Fetch the next page as the user scrolls within `threshold` rows of the end. This is a
// real side effect: it reacts to the virtualizer's scroll position (a value the app does
// not own or derive) and calls an imperative fetch, so it cannot collapse into render or
// a one-shot mount effect. Quarantined in this named hook per docs/conventions/react.md.
export function useLoadMoreOnScroll({
  lastVisibleIndex,
  rowCount,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  threshold,
}: LoadMoreArgs): void {
  React.useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) {
      return
    }
    if (lastVisibleIndex >= rowCount - threshold) {
      fetchNextPage()
    }
  }, [lastVisibleIndex, rowCount, hasNextPage, isFetchingNextPage, fetchNextPage, threshold])
}
