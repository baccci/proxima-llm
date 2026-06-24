import React from 'react'

export function useAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const [isPending, setIsPending] = React.useState(false)
  const [error, setError] = React.useState<Error | null>(null)
  const fnRef = React.useRef(fn)
  fnRef.current = fn

  const run = React.useCallback(async (...args: A): Promise<R> => {
    setIsPending(true)
    setError(null)
    try {
      return await fnRef.current(...args)
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err))
      setError(e)
      throw e
    } finally {
      setIsPending(false)
    }
  }, [])

  return { run, isPending, error }
}
