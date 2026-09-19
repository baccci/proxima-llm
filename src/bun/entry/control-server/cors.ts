// The one browser origin the control server answers to: the vite dev server that
// `bun run dev:hmr` starts. Everything else a browser could send from is refused.
export const DEV_BRIDGE_ORIGIN = 'http://localhost:5173'

type CorsHeaders = Record<string, string>

// Whether a request carrying this Origin may reach a route at all. Native clients send
// no Origin and keep the access they have always had; a browser gets in only from the
// dev server, and only while the bridge is enabled.
export function isOriginAllowed(
  origin: string | null,
  host: string,
  bridgeEnabled: boolean,
): boolean {
  if (!origin) {
    return true
  }
  if (origin === `http://${host}`) {
    return true
  }

  return bridgeEnabled && origin === DEV_BRIDGE_ORIGIN
}

// The headers that let the dev server's page read the reply. Anything else gets an
// empty set, because refusing to grant is what keeps a stray page from reading.
export function corsHeadersFor(origin: string | null, bridgeEnabled: boolean): CorsHeaders {
  if (!bridgeEnabled || origin !== DEV_BRIDGE_ORIGIN) {
    return {}
  }

  return {
    'Access-Control-Allow-Origin': DEV_BRIDGE_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}
