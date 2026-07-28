import { dlopen, FFIType, type Pointer, ptr, toBuffer } from 'bun:ffi'
import type { ProviderId } from '../../shared-contracts/providers/registry'
import { log } from './logging/logger'

const SERVICE = 'com.proxima.apikeys'

// OSStatus success code (errSecSuccess) returned by the Security framework calls.
const SEC_SUCCESS = 0
// Null address in the out-pointers the keychain fills in: no data / no item ref.
const NULL_PTR = 0n

// SecKeychainAddGenericPassword / SecKeychainFindGenericPassword: the older
// (deprecated-in-12) but simpler C API. SecItem* requires CFDictionary marshalling
// which is significantly more FFI plumbing for no functional benefit here.
const { symbols } = dlopen('/System/Library/Frameworks/Security.framework/Security', {
  SecKeychainAddGenericPassword: {
    args: [
      FFIType.ptr,
      FFIType.u32,
      FFIType.ptr,
      FFIType.u32,
      FFIType.ptr,
      FFIType.u32,
      FFIType.ptr,
      FFIType.ptr,
    ],
    returns: FFIType.i32,
  },
  SecKeychainFindGenericPassword: {
    args: [
      FFIType.ptr,
      FFIType.u32,
      FFIType.ptr,
      FFIType.u32,
      FFIType.ptr,
      FFIType.ptr,
      FFIType.ptr,
      FFIType.ptr,
    ],
    returns: FFIType.i32,
  },
  SecKeychainItemDelete: {
    args: [FFIType.ptr],
    returns: FFIType.i32,
  },
  SecKeychainItemFreeContent: {
    args: [FFIType.ptr, FFIType.ptr],
    returns: FFIType.i32,
  },
})

// TextEncoder returns Uint8Array<ArrayBuffer>, satisfying Bun FFI's TypedArray constraint.
// Buffer's .buffer is ArrayBufferLike (can be SharedArrayBuffer) which ptr() rejects.
const enc = (s: string): Uint8Array => new TextEncoder().encode(s)

// Pointer is a branded number type. Cast a known-valid address to it.
// macOS user-space pointers fit within JS's 53-bit safe integer range.
const asPtr = (addr: bigint): Pointer => Number(addr) as unknown as Pointer

type Found = { itemRef: bigint; dataPtr: bigint; dataLen: number }

function findItem(service: string, provider: string): Found | null {
  const svc = enc(service)
  const acc = enc(provider)
  const outLen = new Uint32Array(1)
  const outData = new BigUint64Array(1) // receives *passwordData address
  const outItem = new BigUint64Array(1) // receives SecKeychainItemRef

  const status = symbols.SecKeychainFindGenericPassword(
    null,
    svc.byteLength,
    ptr(svc),
    acc.byteLength,
    ptr(acc),
    ptr(outLen),
    ptr(outData),
    ptr(outItem),
  ) as number

  if (status !== SEC_SUCCESS) {
    return null
  }
  return { itemRef: outItem[0], dataPtr: outData[0], dataLen: outLen[0] }
}

export function getApiKey(provider: ProviderId): string | undefined {
  const found = findItem(SERVICE, provider)
  if (!found || found.dataPtr === NULL_PTR) {
    return undefined
  }

  // Copy the bytes before freeing: toBuffer references foreign memory
  // Second arg is byte OFFSET (not length); third arg is byteLength
  const bytes = new Uint8Array(toBuffer(asPtr(found.dataPtr), 0, found.dataLen))
  symbols.SecKeychainItemFreeContent(null, asPtr(found.dataPtr))
  return new TextDecoder().decode(bytes) || undefined
}

export function setApiKey(provider: ProviderId, key: string): void {
  // Delete existing entry first; SecKeychainAddGenericPassword fails on duplicates
  const existing = findItem(SERVICE, provider)
  if (existing) {
    if (existing.dataPtr !== NULL_PTR) {
      symbols.SecKeychainItemFreeContent(null, asPtr(existing.dataPtr))
    }
    if (existing.itemRef !== NULL_PTR) {
      symbols.SecKeychainItemDelete(asPtr(existing.itemRef))
    }
  }

  const svc = enc(SERVICE)
  const acc = enc(provider)
  const pw = enc(key)

  const status = symbols.SecKeychainAddGenericPassword(
    null,
    svc.byteLength,
    ptr(svc),
    acc.byteLength,
    ptr(acc),
    pw.byteLength,
    ptr(pw),
    null,
  ) as number

  if (status !== SEC_SUCCESS) {
    log.error(`[keychain] SecKeychainAddGenericPassword failed (OSStatus ${status})`)
  }
}

export function hasApiKey(provider: ProviderId): boolean {
  const found = findItem(SERVICE, provider)
  if (!found) {
    return false
  }
  if (found.dataPtr !== NULL_PTR) {
    symbols.SecKeychainItemFreeContent(null, asPtr(found.dataPtr))
  }
  return true
}

export function removeApiKey(provider: ProviderId): void {
  const found = findItem(SERVICE, provider)
  if (!found) {
    return
  }
  if (found.dataPtr !== NULL_PTR) {
    symbols.SecKeychainItemFreeContent(null, asPtr(found.dataPtr))
  }
  if (found.itemRef !== NULL_PTR) {
    symbols.SecKeychainItemDelete(asPtr(found.itemRef))
  }
}
