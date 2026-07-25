# Architecture overview

This is the map of the app: the big pieces, how they fit together, and where a message goes
from the moment you press send. It stays at the high level on purpose. When you need the detail
of one piece, each section points at the reference doc that owns it.

Proxima is a desktop chat app for talking to large language models. You keep chats, optionally
grouped into projects, with attachments, thinking, memory, and tools. It is built for Anthropic
models first, and the seams are cut so a second provider slots in without reworking the core.
OpenRouter is already wired in as that second provider.

## What the app does

- A native desktop window, one project at a time, master and detail: a sidebar of chats on the
  left, the open chat on the right.
- Many chats, optionally grouped into **projects** that carry their own system prompt, memory,
  and files.
- Anthropic and OpenRouter models, with **thinking** and **attachments** (images and PDFs) when
  the chosen model supports them.
- **Memory**: durable notes that survive across chats, both typed by you and written by the model
  through tools.
- **Tools**: the model can call tools during a turn (memory, web search), each gated by a
  permission the user grants.
- **Compaction**: long chats are summarized automatically so they keep fitting the context window.
- Prompt caching on the stable system and memory blocks, to cut cost.
- Streaming markdown with syntax highlighting.
- Local SQLite storage, attachments on disk, API keys in the OS keychain.

## What it is not

- Not multi-window, multi-account, or cloud-synced. One window, local storage.
- Not a general web browser or a full IDE. It is a chat surface with a few power tools.

Provider breadth is a design goal rather than a finished one. The provider seam exists and
OpenRouter proves it, but each new provider is still real work in one place (see
[LLM integration](#llm-integration)).

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Desktop shell | **Electrobun** (Bun main + WebKit renderer) | Bun runtime in the main process, a lean webview, fast startup. |
| UI | React + TypeScript | Standard, typed end to end. |
| Styling | TailwindCSS | Utility classes next to the markup. |
| Animation | Motion (formerly Framer Motion) | Sidebar, message-in, thinking-block expand. |
| UI state | Zustand | A small store per feature, no global blob. |
| Server state | TanStack Query | Owns caching and refetching for everything read over RPC. |
| Forms | React Hook Form | Every form in the renderer. |
| Validation | Zod | Every DTO and every dangerous input, checked at the boundary. |
| Database | **SQLite via `bun:sqlite`** | Synchronous, zero-config, no native rebuild. |
| ORM | **Drizzle** (`drizzle-orm`, `drizzle-zod`) | Pure TypeScript, schema as code, no query-engine binary. |
| LLM SDK | **Vercel AI SDK** + `@ai-sdk/anthropic` + OpenRouter | One streaming interface for thinking, attachments, and tools across providers. |
| Markdown | `react-markdown` + `remark-gfm` + `shiki` | Streaming-friendly, themable, highlighting without a client JS engine. |
| Secrets | OS keychain | Provider API keys never touch the database. macOS today, via a native binding. |
| Logging | `pino` in the main process | Structured logs to disk and stdout. |

## Process model

Electrobun gives the app two operating-system processes that cannot see each other's memory.

```
┌──────────────────────────────────────────────────────────────────────┐
│  MAIN  (Bun)                                                          │
│  ──────────────────────────────────────────────────────────────────  │
│  • SQLite (Drizzle)                                                   │
│  • LLM provider clients (Vercel AI SDK)                              │
│  • Secrets (OS keychain)                                             │
│  • Attachment and project-file I/O                                   │
│  • Two entry adapters: the window RPC door, and the control server    │
│  • Stream registry (tracks in-flight turns by streamId)             │
└──────────────────────────────────────────────────────────────────────┘
                              ▲ typed RPC (request/response + pushes)
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│  RENDERER (WebKit)                                                   │
│  ──────────────────────────────────────────────────────────────────  │
│  • React + TanStack Query + Zustand                                  │
│  • Typed RPC client                                                  │
│  • UI only: never touches the DB, disk, or API keys directly         │
└──────────────────────────────────────────────────────────────────────┘
```

The split is the load-bearing idea of the whole app. A few rules follow from it:

- All secrets, all network, and all storage live in the **main** process.
- The renderer holds only UI state and cached copies of server data. The query layer, not the
  renderer, decides when that data is stale.
- LLM streaming runs in the main process, so a webview reload does not kill an in-flight reply.
  The reply keeps generating and still saves, even though the live typing is lost to the UI until
  the reload settles.

## How a message flows, end to end

This is the single most useful walk in the doc: one message, from you pressing send to the reply
landing back in the window. It ties together the pieces the reference docs cover one at a time.
Read this first, then follow a link for any single hop.

The two processes share no memory, so a message crosses the RPC boundary twice: once as a request
going **down**, then many times as stream chunks coming back **up**. The request returns an id at
once, long before the reply exists. The reply arrives later as a stream of chunks keyed by that id.

**1. The renderer sends, then subscribes.** The composer fires one RPC request, `sendMessage`, and
gets back `{ streamId, assistantMessageId }` immediately, before a single word is generated. It
then subscribes to that `streamId` to listen for chunks. There is no `useEffect`: subscribing
hands back its own unsubscribe function.

**2. The request lands at the door.** [`entry/rpc.ts`](reference/entry-rpc.md) is the entry adapter
for the window. Its `sendMessage` handler parses the input (one of the handlers that parses,
because the value travels deep into the engine) and calls into the chat-stream layer.

**3. The orchestrator starts the turn.** The [chat-stream layer](reference/chat-bun.md) saves the
user message, then runs its **preflight first**: it resolves the model and the API key, and if
either is missing it throws straight back to the caller. Only after preflight passes does it
**register** the stream (mint a `streamId` and an `AbortController`, store the controller in the
`activeStreams` map), emit a `start` chunk so the window shows an empty bubble, and gather the
turn's context. Then it fires the turn **without awaiting it** and returns the ids. Preflight goes
before registering on purpose: a bad key cannot leave a dead entry in the map.

**4. The one model call.** The detached turn compacts the history if it is too long, then calls
into the [stream engine](reference/stream-engine.md), the single entry to the model. The engine
assembles the prompt and tools, wires cancellation (the renderer's stop signal merged with an
idle-timeout signal), calls the AI SDK, and drains the reply fragment by fragment. Each fragment
does two things: it goes out to the window as a chunk, and it is folded into an accumulator that
builds the final message to save.

**5. Chunks flow back up.** Every chunk travels through the injected `streamChunk` push channel to
the renderer's client, which routes it by `streamId` to the callback from step 1. The bubble fills
in live. When the model finishes, the orchestrator saves the assistant message, emits a `done`
chunk carrying it, and a `finally` block deletes the stream from `activeStreams`. If anything threw,
an `error` chunk goes out instead, and cleanup still runs.

**Cancel is the same id going the other way.** `cancelStream(streamId)` looks up the stored
controller, calls `.abort()` with a `user-cancel` reason, and the running model call stops.

| Hop | Lives in | Detail |
|---|---|---|
| send and subscribe | `mainview/features/chat` | [features/chat.md](features/chat.md) |
| RPC door | `bun/entry/rpc.ts` | [reference/entry-rpc.md](reference/entry-rpc.md) |
| turn orchestration | `bun/engine/chat-stream/` | [reference/chat-bun.md](reference/chat-bun.md) |
| the model call | `bun/engine/stream/` | [reference/stream-engine.md](reference/stream-engine.md) |

The shape to remember: **one request down, many chunks up, always cleaned up.**

## Folder layout

The layout is inspired by Feature-Sliced Design but simplified. There is no `processes` or `pages`
layer, because the app is effectively one view. The top split matches the process split:
`shared-contracts/` is the agreement between the two sides, `bun/` is the main process, and
`mainview/` is the renderer.

```
src/
├─ shared-contracts/     # Pure TS. No React, no Bun, no DB. Both processes import it.
│  ├─ schemas/           # Zod schemas: the single source of truth for data shapes.
│  ├─ rpc/               # The AppRPC type: the method list both sides agree on.
│  ├─ models/            # The built-in model seed and definitions.
│  ├─ providers/         # The provider list and guards.
│  ├─ tools/             # Shared tool names and shapes.
│  └─ dev/               # Dev-override keys shared by both sides.
│
├─ bun/                  # Main process.
│  ├─ index.ts           # Boot: open DB, seed models, build the window, wire the push channels.
│  ├─ entry/             # The edges: rpc.ts (the window door) and control-server/ (outside programs).
│  ├─ engine/            # Turn orchestration: chat-stream/, stream/ (the model call), tools/.
│  ├─ features/          # One folder per domain: chat, project, model, memory, attachment,
│  │                     #   compaction, settings, tool-permission, project-file, logs, dev-overrides.
│  ├─ infra/             # The floor: db/, llm/, logging/. Singletons the features sit on.
│  └─ utils/             # Pure, stateless helpers.
│
└─ mainview/             # Renderer (WebKit webview).
   ├─ app/               # Composition root and layout. May import anything below.
   ├─ features/          # Feature-scoped UI: chat, projects, models, settings, sidebar,
   │                     #   memory, focus-mode, devtools. Each owns its components, hooks,
   │                     #   store, services, entities, helpers, as needed.
   ├─ entities/          # Shared domain pieces used by two or more features (model, project, provider).
   ├─ components/        # Shared UI primitives and the modal system.
   ├─ hooks/             # Cross-feature hooks.
   ├─ lib/               # App infrastructure singletons: the RPC client, query client, markdown, highlighter.
   └─ utils/             # Pure, stateless helpers.
```

**Location encodes scope.** A file's folder tells you who may import it. Anything at a root level
(`components/`, `hooks/`, `lib/`, `utils/`, `entities/`) is **shared**, and any feature or `app/`
may use it. Anything under `features/<x>/` is **scoped to feature x**, and only x and `app/` may
use it. A feature reaching into a sibling feature is a smell: lift the shared piece up to the root
instead, and let `app/` hold the cross-feature glue.

```
shared-contracts             ←  bun, mainview   (both processes)
mainview root (shared)       ←  features, app
features/<x>                 ←  app only
```

The finer placement calls (`entities/` versus `helpers/` inside a feature, `lib/` versus `utils/`
at the shared root, and what earns a spot in `shared-contracts/`) are their own topic. They live in
[conventions/architecture.md](conventions/architecture.md), which you read when adding a file.

## The contract between the two processes

`shared-contracts/` is pure TypeScript that both processes import. It is the only folder both sides
share, so the test for whether something belongs there is simple: does something in `bun/` **and**
something in `mainview/` consume it? If not, it is not a contract.

It has two layers. The **schemas** (`schemas/*.schema.ts`) are Zod objects that describe the data
shapes, like `ProjectDTO` and `MessageDTO`. They are real runtime values, so you can call `.parse()`
on them. The **RPC types** (`rpc/app-rpc.types.ts`) are one big `AppRPC` type listing every call and
its `{ params, response }`. That type is erased at build time.

Both exist because a type and a schema do different jobs. A type is a promise the compiler checks
while you write; it vanishes at runtime and cannot inspect real bytes arriving at a boundary. A
schema is a check that runs on those bytes. When data comes off the RPC pipe, out of SQLite, or in
over the control server's HTTP, it is untrusted, and a schema is what turns it into a shape the rest
of the code can trust. The full picture is in
[reference/bun-renderer-contract.md](reference/bun-renderer-contract.md).

## Data and storage

Everything the app remembers lives in one SQLite file on disk. There are nine tables: `models`,
`projects`, `chats`, `messages`, `attachments`, `memory_slices`, `project_files`,
`compaction_snapshots`, and a shared `settings` key-value table.

Two details are worth carrying in your head. First, the schema is written **twice** on purpose: once
as Drizzle table definitions for typed queries, and once as raw `CREATE TABLE` SQL that actually
builds the file. Change one and you must change the other. Second, the `settings` table is a shared
key-value substrate with no single owner: each subsystem owns its own key and validates its own blob
on read, rather than there being a generic settings repository.

Migrations are hand-rolled and idempotent: a `setupSchema()` that runs on every boot and brings any
older database up to date, with no version table. The full story, including why migrations are
hand-rolled and how models are seeded, is in [reference/infra-db.md](reference/infra-db.md).

Data access follows a **repository** shape: one module owns every query for a given aggregate (its
table plus the row-to-DTO parse), and nothing else touches `db` for that aggregate. The reasoning,
and when a repository is actually earned, is in
[conventions/architecture.md](conventions/architecture.md), with the `models` catalog as the worked
example in [reference/model.md](reference/model.md).

## LLM integration

**The model catalog.** Models live in the `models` table so the picker renders instantly and the
network never sits in the render path. A model enters the catalog from one of two **sources**:
`builtin` (shipped in code, seeded on boot) or `openrouter` (the full catalog, synced in the
background). The `source` column decides who may overwrite a row, so the seed and the sync never
step on each other, and the user's enable toggle is always theirs. See
[reference/model.md](reference/model.md).

**Streaming a turn** is split across two layers, and the split is deliberate. The
[chat-stream orchestrator](reference/chat-bun.md) owns all lifecycle: saving messages, the stream
registry, compaction, retry, and cancel. The [stream engine](reference/stream-engine.md) owns the
one model call and nothing else: it never touches SQLite or the registry. So the engine stays a pure
"given a history, stream a reply" function, and everything stateful lives one layer up.

**Tools.** During a turn the model can call tools (memory reads and writes, web search). Each tool
call passes through a permission **gate**: a global policy first, then a per-chat grant, then asking
the user. A turn that hits an "ask" pauses on a promise until the user decides, then resumes. The
tool set and the gate are in [reference/tools.md](reference/tools.md).

**Memory.** Durable notes that carry across chats, each a `{ title, content }` slice with a scope
(global or project) and a source (typed by the user, or written by the model with a tool). The
prompt carries only slice **titles** as a cheap index; the model calls `read_memory` to pull one
note's content when a title looks relevant. See [reference/memory.md](reference/memory.md).

**Compaction.** When a chat grows past the model's context window, the older turns are summarized in
place before the next turn, so the chat keeps fitting. See
[reference/compaction.md](reference/compaction.md).

**Prompt caching.** The system prompt and memory titles are stable across turns within a project, so
they get a cache marker and are billed at the cheaper cached rate. The per-turn user content sits
below the cached block.

**Adding a provider** touches one seam: a provider adapter that builds a language model from an id
and an API key, plus the provider's entries in the catalog. The service layer above does not change.
The provider plumbing is in [reference/infra-llm.md](reference/infra-llm.md).

## IPC and streaming

Electrobun ships a typed, two-direction RPC, so there is no custom IPC router. The contract is the
`AppRPC` type, used on both sides. It has two directions:

- `bun.requests` are renderer-to-bun calls: the renderer asks, bun answers with a response.
- `webview.messages` are bun-to-renderer **pushes**: fire-and-forget, no reply. This is how the
  main process tells the window something changed on its own, streaming chunks being the busiest case.

There are five push channels: `streamChunk` (the live reply), `chatsUpdated`, `modelsUpdated`,
`memoryChanged`, and `controlNavigate` (the control server steering the window). None of them can
reach the window object directly, because that object does not exist yet when the RPC file loads. So
the RPC file leaves empty **slots** and small setter functions, and startup fills them in. Handing a
module its dependencies from the outside like this is called dependency injection, and it is the
pattern that keeps the dependency direction one-way across the whole main process.

The RPC connection is typed but not runtime-validated, and the only caller is the app's own window,
so ordinary database reads trust that typing. A handler parses its input only when the value reaches
somewhere more dangerous than a database row: the file system, the keychain, a fixed set of allowed
values, or the engine. The full handler map and the parse rules are in
[reference/entry-rpc.md](reference/entry-rpc.md).

## The control server

There is a second entry adapter alongside the window door. The **control server** lets other
programs on your machine drive the app over HTTP and WebSocket: start a chat, stream the reply, steer
the window. It is the same "receive a request, call the core, reply" idea as `rpc.ts`, differing only
in who is on the outside and how they connect. It is off unless enabled in settings, and it is paired
with a token so a random program cannot connect. See [reference/control-server.md](reference/control-server.md)
and the wire format in [reference/control-server-api.md](reference/control-server-api.md).

## Secrets

Provider API keys live in the OS keychain, never in the database. One small module is the only code
that touches secrets, exposing get, set, and remove. A raw key never crosses the RPC boundary: the
renderer only ever learns whether a key is configured, and sees a masked `••••••<last4>` once saved.
The keychain binding is macOS-native today and is the main piece to port for other platforms. See
[reference/infra-keychain.md](reference/infra-keychain.md).

## State in the renderer

There are three sources of truth in the renderer, and it matters which one holds a given piece of
state:

- **Server data goes through TanStack Query.** Reads and mutations wrap the typed RPC client, and the
  query layer owns caching and freshness. Data is never fetched inside a `useEffect`.
- **Forms go through React Hook Form.**
- **UI-only state goes in Zustand,** one store per feature, read through per-field selectors.

Only three features actually keep a store: `chat` (the hot one, changing on every streaming token),
`sidebar` (section collapse flags), and `devtools`. The rest (`projects`, `settings`, `models`,
`memory`, `focus-mode`) are storeless: their server data lives in query hooks, and what little UI
state they need rides an existing store or local component state. The reasoning, including why a
selector-less store read is a performance trap on the hot `chat` store, is in
[conventions/data-and-state.md](conventions/data-and-state.md).

## Where to go next

- **[conventions/](conventions/)** — how to write code here: [style](conventions/style.md),
  [react](conventions/react.md), [data-and-state](conventions/data-and-state.md),
  [architecture](conventions/architecture.md) (where a file goes), and
  [webkit-quirks](conventions/webkit-quirks.md).
- **[features/](features/)** — one doc per user-facing feature: chat, projects, settings, sidebar,
  models, focus-mode, devtools.
- **[reference/](reference/)** — the deep dives this overview points at: the RPC door, the chat-stream
  layer, the stream engine, the database, models, memory, tools, compaction, attachments, the control
  server, and the infra singletons.
- **[glossary/glossary.md](glossary/glossary.md)** — plain definitions of the terms used across these
  docs, each with a real example from this app.
