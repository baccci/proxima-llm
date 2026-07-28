import * as auth from './auth'

// Authorization header scheme prefix for bearer tokens.
const BEARER_PREFIX = 'Bearer '

// Pull the bearer token from the Authorization header, falling back to a
// ?token= query param (WebSocket clients can't set headers on the upgrade).
export function bearerFrom(req: Request): string | null {
  const header = req.headers.get('authorization') ?? ''
  if (header.startsWith(BEARER_PREFIX)) {
    return header.slice(BEARER_PREFIX.length).trim()
  }

  const url = new URL(req.url)
  return url.searchParams.get('token')
}

// True when the request carries a valid, non-revoked control token.
export function authenticate(req: Request): boolean {
  const bearer = bearerFrom(req)
  return !!bearer && auth.validateToken(bearer)
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function err(msg: string, status: number): Response {
  return json({ error: msg }, status)
}
