import { describe, expect, test } from 'bun:test'
import { corsHeadersFor, DEV_BRIDGE_ORIGIN, isOriginAllowed } from './cors'

const HOST = '127.0.0.1:7865'
const BRIDGE_ON = true
const BRIDGE_OFF = false

describe('isOriginAllowed', () => {
  test('a request with no Origin is allowed', () => {
    // Native clients (curl, the CLI) send no Origin at all, and they are the control
    // server's original audience.
    expect(isOriginAllowed(null, HOST, BRIDGE_OFF)).toBe(true)
  })

  test('a same-origin request is allowed', () => {
    expect(isOriginAllowed(`http://${HOST}`, HOST, BRIDGE_OFF)).toBe(true)
  })

  test('the vite dev origin is allowed while the bridge is enabled', () => {
    expect(isOriginAllowed(DEV_BRIDGE_ORIGIN, HOST, BRIDGE_ON)).toBe(true)
  })

  test('the vite dev origin is refused while the bridge is disabled', () => {
    expect(isOriginAllowed(DEV_BRIDGE_ORIGIN, HOST, BRIDGE_OFF)).toBe(false)
  })

  test('any other origin is refused even while the bridge is enabled', () => {
    expect(isOriginAllowed('http://evil.example', HOST, BRIDGE_ON)).toBe(false)
  })

  test('a look-alike of the dev origin is refused', () => {
    // Prefix matching would let http://localhost:5173.evil.example through.
    expect(isOriginAllowed(`${DEV_BRIDGE_ORIGIN}.evil.example`, HOST, BRIDGE_ON)).toBe(false)
  })
})

describe('corsHeadersFor', () => {
  test('grants the dev origin read access to the reply', () => {
    expect(corsHeadersFor(DEV_BRIDGE_ORIGIN, BRIDGE_ON)).toEqual({
      'Access-Control-Allow-Origin': DEV_BRIDGE_ORIGIN,
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    })
  })

  test('grants nothing while the bridge is disabled', () => {
    expect(corsHeadersFor(DEV_BRIDGE_ORIGIN, BRIDGE_OFF)).toEqual({})
  })

  test('grants nothing to a request that needs no CORS', () => {
    // No Origin means a native client, which reads the reply regardless.
    expect(corsHeadersFor(null, BRIDGE_ON)).toEqual({})
  })

  test('grants nothing to an origin that is not the dev server', () => {
    expect(corsHeadersFor('http://evil.example', BRIDGE_ON)).toEqual({})
  })
})
