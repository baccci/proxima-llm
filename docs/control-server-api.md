# LLM Chat — Control Server API

The control server lets a **local** program drive LLM Chat by injecting prompts or streaming responses back
over the wire. Injected prompts run through the app's normal pipeline and render in the app UI.

Two modes:
- **`POST /prompt`** — fire-and-forget injector. Returns `202` immediately; the answer renders in-app. Watch
  lifecycle events over `/events`.
- **`POST /completions`** — SSE stream. Holds the connection and streams every token back to the caller as
  `text/event-stream`; the same turn also renders in-app.

---

## Enabling the server

Off by default. In the app: **Settings → Connect**.

- Toggle the control server **on**. It binds to `127.0.0.1` only (never internet-exposed) on the configured
  **port** (default **`7865`**).
- It auto-starts on app launch whenever it was left enabled.

All examples below assume `http://127.0.0.1:7865`.

---

## Security model

Two independent gates:

1. **Connection auth** (this doc) — a client must pair once to receive a bearer token, then send it on every
   request.
2. **Tool auth** — injected prompts run through the normal model + tool permission gate. If a tool's global
   policy is `ask`, the approval prompt fires **in the app** (the human at the machine approves). External
   apps cannot pre-authorize tools in v1.

Transport hardening (enforced server-side):

- **Localhost only.** Requests whose `Host` is not `127.0.0.1`/`localhost` are rejected `403`.
- **Cross-origin blocked.** If an `Origin` header is present and isn't `http://<host>`, the request is
  rejected `403` (blocks browser pages on other origins; native/CLI clients that send no `Origin` are fine).

### Pairing → token

1. In **Settings → Connect**, generate a **pairing code**. It is **single-use** and expires after **5
   minutes**.
2. Your program exchanges that code for a long-lived **bearer token** via `POST /pair`.
3. Send the token on every subsequent request:
   - HTTP: `Authorization: Bearer <token>`
   - WebSocket: `Authorization: Bearer <token>` header **or** `?token=<token>` query param.
4. Tokens are **persisted and revocable** — Settings → Connect lists active tokens (by label, created/last-used
   time) and lets you revoke any of them. A revoked token immediately returns `401`.

---

## Endpoints

| Method & path        | Auth        | Purpose                                              |
| -------------------- | ----------- | ---------------------------------------------------- |
| `POST /pair`         | none (code) | Exchange a pairing code for a bearer token           |
| `GET  /chats`        | Bearer      | List existing chats (to target by id)                |
| `GET  /models`       | Bearer      | List enabled models accepted by `/prompt` and `/completions` |
| `POST /prompt`       | Bearer      | Inject a prompt; it runs and streams in the app      |
| `POST /completions`  | Bearer      | Run a prompt and stream the response back (SSE)      |
| `GET  /events`       | Bearer (WS) | WebSocket lifecycle channel                          |

All error responses are JSON: `{ "error": "<message>" }` with the noted status code.

---

### `POST /pair`

Exchange a pairing code (from Settings → Connect) for a bearer token. **Unauthenticated.**

**Request body**

```json
{ "code": "<pairing-code>", "label": "My Script" }
```

| Field   | Type   | Required | Notes                                                          |
| ------- | ------ | -------- | -------------------------------------------------------------- |
| `code`  | string | yes      | The single-use code shown in Settings → Connect.              |
| `label` | string | no       | Human-readable name shown in the token list. Default `"Connected Client"`. |

**Responses**

- `200` → `{ "token": "<bearer-token>" }`
- `400` → `{ "error": "Missing code" }`
- `401` → `{ "error": "Invalid or expired code" }` (also if the code was already used)

```bash
curl -s -X POST http://127.0.0.1:7865/pair \
  -H 'Content-Type: application/json' \
  -d '{ "code": "PASTE_CODE_HERE", "label": "My Script" }'
# → {"token":"abc123…"}
```

---

### `GET /chats`

List all chats, newest activity first. Use a chat's `id` as a `target` for `POST /prompt`.

**Response** `200` → `ChatDTO[]`:

```jsonc
[
  {
    "id": "uuid",
    "projectId": "uuid | null",
    "title": "string",
    "pinned": false,
    "modelId": "string | null",
    "createdAt": "ISO-8601",
    "updatedAt": "ISO-8601",
    "lastMessageAt": "ISO-8601"
    // (composer state is also present)
  }
]
```

- `401` if the bearer token is missing/invalid.

```bash
curl -s http://127.0.0.1:7865/chats -H "Authorization: Bearer $TOKEN"
```

---

### `GET /models`

List all enabled models that `POST /prompt` and `POST /completions` will accept. Use this to discover valid
`model` ids. Both routes enforce this same gate — a disabled model is rejected pre-flight by either endpoint.

**Response** `200` → array of model objects:

```jsonc
[
  {
    "id": "claude-sonnet-4-6",
    "displayName": "Claude Sonnet 4.6",
    "provider": "anthropic",
    "family": "claude-sonnet",
    "available": true   // false if no API key is configured for this provider
  }
]
```

| Field         | Type    | Notes                                                             |
| ------------- | ------- | ----------------------------------------------------------------- |
| `id`          | string  | Pass this as `model` in `POST /prompt`.                           |
| `displayName` | string  | Human-readable name.                                              |
| `provider`    | string  | Provider the model belongs to (e.g. `"anthropic"`).              |
| `family`      | string  | Model family.                                                     |
| `available`   | boolean | `true` if an API key is configured for this provider; `false` means the model is enabled but can't be used until a key is added. |

- `401` if the bearer token is missing/invalid.

```bash
curl -s http://127.0.0.1:7865/models -H "Authorization: Bearer $TOKEN"
```

---

### `POST /prompt`

Inject a prompt. The server resolves a target chat, kicks off a stream through the normal pipeline, navigates
the app to that chat, and returns immediately (`202`) — the answer renders **in the app**, not in this
response.

**Request body**

| Field      | Type    | Required | Default            | Notes                                                                 |
| ---------- | ------- | -------- | ------------------ | --------------------------------------------------------------------- |
| `text`     | string  | **yes**  | —                  | The user prompt to send.                                              |
| `target`   | string  | no       | `"new"`            | `"new"` \| `"active"` \| `"<chatId>"`. See below.                     |
| `model`    | string  | no       | app default model  | Model id from `GET /models`. If omitted, uses the app's configured default model. Unknown ids are rejected pre-flight — no chat is created. |
| `project`  | string  | no       | —                  | Project id; only applies when `target: "new"` (puts the new chat in that project). |
| `thinking` | boolean | no       | `false`            | Enable extended thinking for this turn (if the model supports it).    |
| `focus`    | boolean | no       | `false`            | Open **focus mode** on the target chat so you can watch it stream. If the user is already in focus mode, whether the app auto-jumps to your prompt is governed by the in-app **"Follow incoming prompts"** setting (default on); otherwise a "Jump in" prompt appears. |

**`target` semantics**

- `"new"` — create a fresh chat (optionally in `project`). Always succeeds.
- `"active"` — the chat currently open in the app. `409` if there is no active chat.
- `"<chatId>"` — an existing chat id (from `GET /chats`). `404` if it doesn't exist.

**Responses**

- `202` → `{ "chatId": "<id>", "streamId": "<id>" }` — accepted; the stream has started. Use `streamId` to
  correlate WS lifecycle events.
- `400` → `{ "error": "Missing text" }`
- `400` → `{ "error": "No model specified and no default model configured" }`
- `400` → `{ "error": "Unknown model: <id>. Call GET /models for valid ids." }` — the model id isn't known; no chat was created.
- `400` → `{ "error": "No API key configured for provider: <provider>" }` — model is known but its provider has no key configured.
- `404` → `{ "error": "Chat not found: <target>" }`
- `409` → `{ "error": "No active chat" }` (only for `target: "active"`)
- `401` if the bearer token is missing/invalid.

```bash
curl -s -X POST http://127.0.0.1:7865/prompt \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{ "text": "Summarize today's standup notes.", "target": "new", "focus": true }'
# → {"chatId":"…","streamId":"…"}   (HTTP 202)
```

> **Side effects:** the app navigates to the target chat and, when `focus: true`, opens focus mode and follows
> the incoming turn automatically.

---

### `POST /completions`

Run a prompt and stream the model's response back to the caller as **Server-Sent Events**. The same turn also
renders in the app. Unlike `/prompt`, this route holds the connection open until the turn finishes and does
**not** navigate the app's view by default.

**Request body** — identical fields to `POST /prompt`, minus `focus` (navigation is off by default):

| Field      | Type    | Required | Default           | Notes                                                              |
| ---------- | ------- | -------- | ----------------- | ------------------------------------------------------------------ |
| `text`     | string  | **yes**  | —                 | The user prompt.                                                   |
| `target`   | string  | no       | `"new"`           | `"new"` \| `"active"` \| `"<chatId>"`. Same semantics as `/prompt`. |
| `model`    | string  | no       | app default model | Must be an **enabled** model from `GET /models`. Disabled ids are rejected pre-flight. |
| `project`  | string  | no       | —                 | Project id; only applies when `target: "new"`.                    |
| `thinking` | boolean | no       | `false`           | Enable extended thinking for this turn.                           |

**Response** `200 text/event-stream` — one SSE `data:` line per chunk, each a `StreamChunk` JSON object:

| `kind`                    | When                                                             |
| ------------------------- | ---------------------------------------------------------------- |
| `accepted`                | Synthetic first event — `{ kind: "accepted", chatId: "<id>" }`. Use `chatId` to correlate with `/events`. |
| `start`                   | Engine started — `{ kind: "start", assistantMessageId: "<id>" }`. |
| `text-delta`              | Token — `{ kind: "text-delta", delta: "…" }`.                   |
| `reasoning-delta`         | Thinking token (when `thinking: true`).                          |
| `tool-call`               | Tool invocation started.                                         |
| `tool-result`             | Tool result returned.                                            |
| `tool-approval-request`   | Approval prompt fired **in the app** — informational only; approve/deny via the app UI. |
| `done`                    | Terminal — `{ kind: "done", message: … }`. Connection closes after this. |
| `error`                   | Terminal — `{ kind: "error", error: "…" }`. Connection closes after this. |

**Notes:**
- Lifecycle events (`accepted` / `started` / `done` / `error`) are also broadcast on `/events` as usual.
- If the client disconnects early, the underlying model run is **not** aborted — it continues in-app.
- Tool approvals still happen in-app (`tool-approval-request` is informational; no bidirectional protocol).

**Error responses** (before the stream opens — JSON, same codes as `/prompt`):
- `400` missing/invalid body fields, unknown/disabled model, no API key
- `404` chat not found, `409` no active chat, `401` unauthorized

```bash
curl -N -X POST http://127.0.0.1:7865/completions \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{ "text": "Count to five." }'
# data: {"kind":"accepted","chatId":"…"}
# data: {"kind":"start","assistantMessageId":"…"}
# data: {"kind":"text-delta","delta":"1"}
# …
# data: {"kind":"done","message":{…}}
```

---

### `GET /events` — WebSocket lifecycle channel

Connect a WebSocket to observe prompt lifecycle. **Listen-only** — any messages you send are ignored.

**Connect** (`ws://127.0.0.1:7865/events`) with the token via header or query param:

```
ws://127.0.0.1:7865/events?token=<bearer-token>
```

A missing/invalid token fails the upgrade with `401`.

**Messages** — each is a JSON object:

```jsonc
{ "event": "accepted" | "started" | "done" | "error", "chatId": "<id>", "streamId": "<id>" }
```

| `event`    | When                                                          |
| ---------- | ------------------------------------------------------------- |
| `accepted` | Immediately after `POST /prompt` is accepted.                |
| `started`  | The model stream has begun producing output.                 |
| `done`     | The stream finished successfully.                            |
| `error`    | The stream failed.                                            |

**Important:** events are **broadcast to all connected clients** and are **not** filtered per stream. Match on
the `streamId` (and/or `chatId`) returned by your `POST /prompt` call to track the turn you care about. To
chain prompts, wait for the `done` event matching your `streamId` before sending the next.

> The WS carries lifecycle only. For token-by-token response text, use `POST /completions`.

---

## End-to-end example (Node-ish pseudocode)

```js
const BASE = 'http://127.0.0.1:7865'

// 1. Pair once (code copied from Settings → Connect). Store the token; reuse it.
const { token } = await fetch(`${BASE}/pair`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ code: PAIRING_CODE, label: 'My Script' }),
}).then((r) => r.json())

// 2. Watch lifecycle.
const ws = new WebSocket(`ws://127.0.0.1:7865/events?token=${token}`)
ws.onmessage = (m) => {
  const e = JSON.parse(m.data)
  if (e.streamId === pending?.streamId && e.event === 'done') {
    // safe to send the next prompt
  }
}

// 3. Inject a prompt; watch it stream in the app (focus mode on).
const pending = await fetch(`${BASE}/prompt`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ text: 'Draft a haiku about Tuesdays.', target: 'new', focus: true }),
}).then((r) => r.json()) // → { chatId, streamId }
```

---

## Limitations (v1)

These are intentional for pre-alpha-1; see roadmap #8 for follow-ups:

- **No queueing.** Targeting a chat that's mid-stream is not guarded/queued — prefer `target: "new"` for
  fire-and-forget, or gate sends on the `done` event yourself.
- **No advance tool authorization.** `ask`-policy tools always prompt the human in the app; external apps
  can't pre-approve. `POST /completions` surfaces `tool-approval-request` chunks as informational; the
  allow/deny happens in-app.
- **Client disconnect does not abort.** If the caller of `POST /completions` disconnects mid-stream, the
  model run continues — it's also rendering in-app and the user may still want it.
- **Localhost only**, by design — there is no remote/internet access mode.
</content>
