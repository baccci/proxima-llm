import { IDLE_TIMEOUT_ERROR_NAME } from './stream-result'

export type IdleTimeout = {
  signal: AbortSignal
  reset: () => void
  clear: () => void
}

// A watchdog that aborts when the model stalls. The stream calls reset() on every
// delta; if timeoutMs passes with no delta, the signal aborts with a DOMException
// named IDLE_TIMEOUT_ERROR_NAME so classifyAbort can tell it apart from a user
// cancel. run.ts merges this signal with the user-cancel signal before handing it
// to the SDK, so this owns only the idle half.
export function createIdleTimeout(timeoutMs: number): IdleTimeout {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined

  const reset = () => {
    clearTimeout(timer)
    timer = setTimeout(
      () => controller.abort(new DOMException('idle-timeout', IDLE_TIMEOUT_ERROR_NAME)),
      timeoutMs,
    )
  }

  const clear = () => {
    clearTimeout(timer)
  }

  // Arm immediately so a model that never emits a first delta still times out.
  reset()

  return { signal: controller.signal, reset, clear }
}
