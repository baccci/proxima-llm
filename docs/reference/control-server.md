# The control server (`src/bun/entry/control-server/`)

The app's local "remote control" surface: an HTTP and WebSocket server that lets programs *outside* the
app send prompts to the LLM and read the replies. It is the twin of
[`rpc.ts`](../../src/bun/entry/rpc.ts).

## What it is (in one breath)

Proxima is a desktop chat app you drive by clicking. The **control server** is a second door into the
same app: a small web server, running on your own machine, that lets *other* programs do the driving:
send a message to a model, start a chat, read the streamed reply. Think of it as a **remote control** for
the app.

Examples of who uses that door: a phone on the same machine over `localhost`, a shell script, a
Raycast/Alfred command, any bit of automation you write.

It is the **twin of [`rpc.ts`](../../src/bun/entry/rpc.ts)**. Both are *entry adapters*, the edge where
the outside world talks to the app's core:

| Door | Who's on the outside | Transport |
|---|---|---|
| `rpc.ts` | the app's own UI (the renderer window) | Electrobun IPC |
| `control-server/` | other programs on your machine | HTTP + WebSocket |

Neither contains business logic. They receive a request, call into `engine/` and `features/`, and shape a
response. (This is the `entry → engine → features → infra` layering: entry calls inward, never the
reverse.)

## Why it exists

A desktop GUI is great for a human, useless for a script. Sometimes you want to fire a prompt at the app
without touching the mouse: from your phone, from the terminal, from a scheduled job. The control server
is that programmatic entry point. It reuses the exact same machinery the UI uses (`startChatStream`, the
chat/model/settings repositories), so a prompt sent over HTTP behaves identically to one you typed.

## Is it safe? (the guardrails)

It is off by default and locked to your own machine. Four layers, outermost first:

1. **Bound to `127.0.0.1`.** The socket only listens on loopback, so nothing on your Wi-Fi or LAN can
   reach it, only programs on *this* machine.
2. **Host and origin checks.** Every request must have a `Host` of `127.0.0.1` or `localhost` and (if it
   sends an `Origin`) a matching one. This is belt-and-suspenders on top of the bind, and it blocks a
   malicious web page from quietly POSTing to `localhost` in the background. The one exception is the
   Vite dev server's origin, allowed only while the dev browser bridge is open.
3. **A bearer token on everything except pairing.** No valid token, `401`.
4. **Pairing to get that token.** You generate a short code inside the app; the external client trades the
   code for a long-lived token once. Codes live in memory only, expire after 5 minutes, and are
   single-use.

It is opt-in: the server only starts if `controlServerEnabled` is set (from Settings, or auto-started at
boot if it was on last time). See `index.ts` boot and `rpc.ts` `updateSettings` (which toggles it live).

## The pieces (eight files)

The folder is split one concern per file:

| File | Plain-language job |
|---|---|
| [`auth.ts`](../../src/bun/entry/control-server/auth.ts) | The **bouncer's list**. Makes pairing codes, mints/validates/revokes tokens, remembers them in the DB. |
| [`http.ts`](../../src/bun/entry/control-server/http.ts) | **Tiny HTTP helpers** every route shares: read the bearer token off a request, check it (`authenticate`), build JSON and error responses. |
| [`events.ts`](../../src/bun/entry/control-server/events.ts) | The **loudspeaker**. Tracks connected WebSocket listeners and `broadcast`s lifecycle pings to all of them. |
| [`sse.ts`](../../src/bun/entry/control-server/sse.ts) | The **SSE writer**. `streamCompletionsResponse` runs a stream and dribbles each chunk back to the caller as Server-Sent Events, closing on `done`/`error`. |
| [`routes.ts`](../../src/bun/entry/control-server/routes.ts) | The **switchboard**. `handleRequest` guards, then matches method and path to what each endpoint does. |
| [`server.ts`](../../src/bun/entry/control-server/server.ts) | The **power switch**. `startControlServer` / `stopControlServer` stand up Bun's HTTP server and wire the WebSocket upgrade. |
| [`cors.ts`](../../src/bun/entry/control-server/cors.ts) | The **doorman for browsers**. Decides which `Origin` may call at all, and which gets the headers that let it read the reply. |
| [`rpc-dispatch.ts`](../../src/bun/entry/control-server/rpc-dispatch.ts) | The **name-to-handler lookup** behind `POST /rpc`: read the envelope, find the method, call it, report the outcome. Knows nothing about HTTP. |
| [`bridge-mode.ts`](../../src/bun/entry/control-server/bridge-mode.ts) | One fact: whether the dev browser bridge is open. `routes.ts`, `server.ts` and `index.ts` all read it. |

One-way imports: `server.ts` to `routes.ts` to (`http.ts`, `events.ts`, `auth.ts`, `sse.ts`, `cors.ts`,
`rpc-dispatch.ts`). `broadcast` lives in `events.ts` (not `server.ts`) specifically so `routes.ts` can call
it without a `routes` and `server` import cycle.

Two of these are deliberately leaves that import nothing from the folder, `cors.ts` and `rpc-dispatch.ts`.
Both hold a decision worth testing on its own, and keeping them clear of `http.ts` (which reaches the
database through `auth.ts`) is what lets their tests run against the real functions instead of a mocked
database.

## The endpoints

| Method + path | Token? | What it does |
|---|---|---|
| `POST /pair` | no | Trade a pairing code for a token. Body `{ code, label? }` to `{ token }`. |
| `GET /chats` | yes | List all chats. |
| `GET /models` | yes | List enabled models, each flagged `available` (has an API key). |
| `POST /prompt` | yes | Send a message; the reply streams **into the app**. Returns `202 { chatId, streamId }` right away. |
| `POST /completions` | yes | Send a message; the reply streams **back to the caller** as SSE (and still runs in-app). |
| `WS /events` | yes | Open a listen-only socket; receive a lifecycle ping for every stream. |
| `POST /rpc` | **dev only** | The window's whole RPC surface, by method name. Exists only under `HMR=1`. |
| `WS /bridge` | **dev only** | Listen-only socket carrying the six renderer pushes. Exists only under `HMR=1`. |

### The two dev-only endpoints

These two exist so the renderer can run in an ordinary browser tab against the running app, for real
devtools, for testing outside WebKit, and to export the rendered design. They are **not** part of the
public control-server API and never appear in a shipped build.

`POST /rpc` takes `{ method, params }`, looks the method up in the RPC layer's own handler table, and
answers `{ result }`. `WS /bridge` carries the other direction: every push the desktop window receives is
broadcast to it as `{ channel, payload }`, so both renderers watch the same run.

Neither asks for a token, which is a deliberate trade and the reason for the gate. Three things hold the
line:

1. **`HMR=1` or nothing.** Both are absent from a release build even with the control server switched on,
   so enabling the server from Settings never exposes them.
2. **One allowed browser origin.** `POST /rpc` answers a browser only from `http://localhost:5173`, the
   Vite dev server. A page on any other origin is refused before a handler runs, not merely stopped from
   reading the reply.
3. **Loopback only**, like everything else here.

A WebSocket handshake is not subject to CORS, so for `/bridge` the dev gate is the whole of the
protection. That is the reason it is a separate socket from `/events` rather than a second message type on
it: `/events` is a documented, authenticated API with its own external clients, and they must not start
receiving the renderer's traffic.

## How a request flows (`POST /prompt`, start to finish)

```
client → Bun.serve.fetch (server.ts)
           │  path is /events?  → auth + WebSocket upgrade, done
           └─ else → handleRequest (routes.ts)
                       1. host + origin guards           → 403 if off-machine / cross-origin
                       2. /pair is public; else authenticate() → 401 if no valid token
                       3. match method + path            → the route body
                       4. resolvePromptRequest(body)      → pick the chat + model, or an error Response
                       5. startChatStream(...)            → engine kicks off the model turn
                       6. pushControlNavigate(...)        → tell the UI to jump to that chat
                       7. broadcast({ event: 'accepted' })→ ping WS listeners
                       8. return 202 { chatId, streamId }
```

`resolvePromptRequest` is the validation gate: it checks there is text, picks the model (a request
override or the default), confirms the model exists and is enabled and has an API key, then resolves
*which* chat to use: `target: 'new'` (create one), `'active'` (whatever chat the UI currently has open), or
an existing chat id. It returns a **discriminated result**: `{ ok: true, chatId, modelId }` or
`{ ok: false, response }`, a ready-made error `Response`. The caller just does
`if (!resolved.ok) return resolved.response`. (No throwing for expected validation failures.)

## Two ways to read the reply (the key idea)

A model reply is a *stream* of little fragments. The control server offers two delivery modes, and the
difference matters:

- **`POST /prompt`, fire-and-forget.** Returns `202` immediately. The reply streams **into the app
  window**, not back to you. Your program just *started* the turn; if it wants progress, it listens on
  `WS /events`. Use this to "poke the app from outside."
- **`POST /completions`, SSE.** The reply streams **back to your program**, chunk by chunk, over the same
  HTTP response, *and* still renders in-app. Use this when the caller wants the text.

**SSE (Server-Sent Events)** is a normal HTTP response that stays open and dribbles out text events, each a
line like `data: {...}\n\n`. It is one-way (server to client). Here each event is one stream chunk; a
`done`/`error` chunk closes it.

**WebSocket `/events`** is a persistent pipe. Here it is **listen-only**: clients never send anything; they
receive a small JSON ping (`accepted` / `started` / `done` / `error` plus `chatId` and `streamId`) for
*every* stream in the app, wherever it started. That is `broadcast` fanning out to all sockets.

## Concerns / footguns

- **A disconnected SSE client does not cancel the model.** If the caller hangs up mid-`/completions`, a
  `closed` flag stops writing to the dead socket, but the in-app turn keeps running to completion (it is
  being persisted in-app anyway). Killing the reader must not kill the work.
- **`validateToken` writes to the DB on every authenticated request** (to stamp `lastUsedAt`). That is
  write-amplification, one DB write per API call. Fine at this scale; flagged for later.
- **Two routing entry points, on purpose.** The `WS /events` upgrade is handled in `server.ts`'s `fetch`
  (it *must* happen at the Bun.serve boundary); everything else is delegated to `routes.ts`. Do not try to
  fold the upgrade into `handleRequest`.
- **`target: 'active'` needs the UI.** It reads the renderer's currently-open chat via `getActiveChatId()`
  (kept in `rpc.ts`). If nothing is open, `409`.
- **Single instance.** A module-level `let server` makes `startControlServer` idempotent: calling it while
  already running is a no-op.

## Patterns used

- **Inbound adapter (ports and adapters).** A sibling of `rpc.ts`. It translates a transport (HTTP/WS) into
  calls on `engine` and `features`, and never the other way.
- **Result-or-Response union.** `resolvePromptRequest` returns a value on success or a prebuilt error
  `Response` on failure, instead of throwing: expected failures are data, not exceptions.
- **Pull the shared concern into its own file to break a cycle.** `broadcast` and the socket set became
  `events.ts` so both `routes.ts` and `server.ts` can use it with no circular import.

## Security note

Request bodies arrive as untyped JSON and are parsed with zod (`PairBody` / `PromptBody` via `safeParse`);
a malformed shape returns `400` before any logic runs, then `resolvePromptRequest` does the semantic checks
(text present, model exists/enabled/keyed, chat resolves). Bad input is rejected at the door, not trusted
downstream.

`POST /rpc` is the exception, and it is one on purpose. Its envelope is parsed, so a body with no method
name is a `400`, but the `params` inside go to the handler untouched. That is the same trust the app's own
window gets, and it is only defensible because the route is dev-only and the caller is the app's own
renderer code. Parsing at that door would mean a schema for all ~45 handlers. If the bridge ever stopped
being dev-only, that work would come first.

## Links

- Its twin: [entry-rpc.md](entry-rpc.md) and [`entry/rpc.ts`](../../src/bun/entry/rpc.ts) — the in-app
  entry door.
- What it calls: [chat-bun.md](chat-bun.md) (`startChatStream`) and the `chat` / `model` / `settings`
  repositories.
- [control-server-api.md](control-server-api.md) — the external HTTP/WebSocket API in full.
- [../architecture.md](../architecture.md) — the full process model, IPC, DB.
