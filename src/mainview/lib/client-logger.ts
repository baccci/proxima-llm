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
    const msg = e.error instanceof Error ? e.error.message : e.message
    const stack = e.error instanceof Error ? e.error.stack : undefined
    sendError(msg, stack)
  })

  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason
    const msg = reason instanceof Error ? reason.message : String(reason)
    const stack = reason instanceof Error ? reason.stack : undefined
    sendError(msg, stack)
  })
}
