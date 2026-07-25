import { rpcRequest } from './rpc.client'

function sendError(msg: string, stack?: string): void {
  // fire-and-forget — renderer doesn't await log writes.
  // Swallow everything: a throw or rejection here would re-trigger the
  // error / unhandledrejection listeners below and feed itself a log storm.
  try {
    rpcRequest()
      .logClientError({ msg, stack })
      ?.catch(() => {})
  } catch {
    // never let the logger throw back into the global error handlers
  }
}

export function installClientLogger(): void {
  window.addEventListener('error', (e) => {
    const isInstanceError = e.error instanceof Error
    const msg = isInstanceError ? e.error.message : e.message
    const stack = isInstanceError ? e.error.stack : undefined
    sendError(msg, stack)
  })

  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason
    const isInstanceError = reason instanceof Error
    const msg = isInstanceError ? reason.message : String(reason)
    const stack = isInstanceError ? reason.stack : undefined
    sendError(msg, stack)
  })
}
