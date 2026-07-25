# Infra: the keychain (`src/bun/infra/keychain.ts`)

The secrets vault: where provider API keys are stored, using the macOS Keychain over Bun FFI. **This is
the app's one macOS-only file** — read the "Porting to other OSes" section before adding Windows or Linux
support.

## What this is, in plain language

The app needs the user's provider API keys (Anthropic, OpenRouter) to make model calls. Those are
**secrets**, so they do **not** go in the app database: they go in the **OS keychain**, which encrypts them
at rest and gates access through the OS. This file is the whole interface to that vault: four functions,
keyed by provider.

| Function | Does |
|---|---|
| `getApiKey(provider)` | read the key, or `undefined` if none |
| `setApiKey(provider, key)` | store (or replace) the key |
| `hasApiKey(provider)` | is a key stored? (no decode) |
| `removeApiKey(provider)` | delete the key |

Every entry is stored under a fixed service name `com.proxima.apikeys` with the **provider id as the
account**, so there is one key per provider.

## Why the DB does not hold these

API keys in the SQLite file would sit in plaintext on disk, readable by anything that can open the file.
The OS keychain gives encryption-at-rest and OS-level access control for free. Keeping secrets out of
`settings` (the app KV table) is deliberate: [infra-db.md](infra-db.md) stores app data; secrets are a
different trust class and get a different store.

## How it talks to the keychain (Bun FFI)

There is no npm package doing this here: the file calls the **macOS Security framework directly** through
Bun's foreign-function interface (`bun:ffi`):

- `dlopen('/System/Library/Frameworks/Security.framework/Security', { ... })` loads the native library and
  declares the four C symbols it uses, with their argument and return FFI types.
- It uses the **older `SecKeychain*` C API** (`SecKeychainAddGenericPassword`,
  `SecKeychainFindGenericPassword`, `SecKeychainItemDelete`, `SecKeychainItemFreeContent`). These are
  deprecated-since-macOS-12 but far simpler to call over FFI than the modern `SecItem*` API, which needs
  `CFDictionary` marshalling, a lot more plumbing for no functional gain here.

**FFI is manual and unforgiving**, so the file is careful in ways normal TS is not:

- `enc()` encodes strings with `TextEncoder` (returns `Uint8Array<ArrayBuffer>`, which Bun FFI's `ptr()`
  accepts; a `Buffer`'s `.buffer` can be a `SharedArrayBuffer`, which `ptr()` rejects).
- `asPtr()` casts a `bigint` address to Bun's branded `Pointer` type; macOS user-space addresses fit inside
  JS's 53-bit safe-integer range, so the `Number()` narrowing is safe.
- `findItem()` passes out-pointers (`Uint32Array` / `BigUint64Array` of length 1) that the C call fills in
  with the found item ref, the password data address, and its length.
- **Memory is copied before it is freed.** `getApiKey` does `new Uint8Array(toBuffer(dataPtr, 0, len))` to
  copy the bytes, *then* `SecKeychainItemFreeContent`, because `toBuffer` references the foreign memory the
  keychain allocated; reading it after the free would be a use-after-free. Every path that finds an item
  also frees its `dataPtr` (and `removeApiKey` / `setApiKey` delete the `itemRef`).
- `setApiKey` **deletes any existing entry first**, because `SecKeychainAddGenericPassword` fails on a
  duplicate rather than overwriting.

Success is `OSStatus == 0` (`SEC_SUCCESS`); a null out-pointer is `NULL_PTR` (`0n`). A failed `set` is
**logged, not thrown** (see footguns).

## Porting to other OSes

**The entire file is macOS-specific, but its four-function interface is not.** That is the seam to keep.
When adding Windows or Linux support, everything below the interface changes; nothing above it (the RPC
`setApiKey` / `hasApiKey` handlers, the adapters reading `getApiKey`) should change.

What is macOS-only and must be replaced:

- The `dlopen` path (`/System/Library/Frameworks/Security.framework/Security`), all four `SecKeychain*`
  symbols, and the `OSStatus` / `SEC_SUCCESS` conventions.
- The `com.proxima.apikeys` service concept maps to each OS's own notion (a "target" or "service" string).

Suggested shape for the port:

1. Define a `KeyStore` interface equal to today's four functions (`getApiKey` / `setApiKey` / `hasApiKey` /
   `removeApiKey`, keyed by `ProviderId`).
2. Provide one implementation per platform and pick it at boot by `process.platform`:
   - **macOS** — the current FFI file, unchanged.
   - **Windows** — Credential Manager (`CredWrite` / `CredRead` / `CredDelete` via FFI, or a small native
     lib).
   - **Linux** — the Secret Service API / libsecret (or a keyring library). Note: a headless Linux box may
     have **no** secret service running, so the port needs an explicit fallback (an encrypted key file) or a
     clear "no secret store available" error, not a silent failure.
3. Keep callers importing a single `keychain` module whose export is the platform-selected implementation.

**Boot hazard to fix during the port:** `dlopen` runs at **import time**. Importing `keychain.ts` on a
non-macOS OS throws immediately (the framework path does not exist), and because `entry/rpc.ts` imports it
directly, the whole app would fail to boot off-macOS. The platform selection must happen **before** any
macOS-only module is imported (a dynamic import or a platform switch), or the current file has to guard its
`dlopen`. This is the first thing to change, before wiring any new backend.

## Concerns / footguns

- **macOS-only; imports crash elsewhere.** Covered above, the top porting blocker.
- **Deprecated API.** `SecKeychain*` is deprecated since macOS 12. It still works, but a future macOS could
  remove it, forcing a move to `SecItem*` (the CFDictionary plumbing avoided today).
- **A failed `set` is logged, not thrown.** If `SecKeychainAddGenericPassword` returns non-zero, the key is
  silently not stored and the user later sees "no API key configured" with no obvious cause. Consider
  surfacing the failure to the caller.
- **FFI memory discipline is load-bearing.** Every found item's `dataPtr` must be freed and copied before
  the free; a missed `SecKeychainItemFreeContent` leaks, a read-after-free corrupts. The current paths are
  correct; keep them that way when editing.

## Named constants / vocabulary

- `SERVICE = 'com.proxima.apikeys'` — the keychain service all entries live under.
- `SEC_SUCCESS = 0` — the Security framework's `errSecSuccess`.
- `NULL_PTR = 0n` — the null address in the out-pointers.

## Tests

None, and none are feasible as pure units: every function performs FFI calls with real side effects on the
user's keychain. This is integration surface (and OS-specific), not testable logic. A future `KeyStore`
interface (see porting) would at least let callers be tested against a fake, but the backends themselves
stay untested by unit.

## Links

- [infra-db.md](infra-db.md) — why secrets live here, not in the `settings` table.
- [infra-llm.md](infra-llm.md) — the adapters read `getApiKey` to build a provider client.
- `entry/rpc.ts` — the `setApiKey` / `hasApiKey` handlers (which narrow the wire provider with
  `ProviderId.parse` before it reaches the keychain).
- [../architecture.md](../architecture.md) — process model; secrets versus app data.
