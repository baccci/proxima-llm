# The chat-stream layer (`src/bun/engine/chat-stream/`)

The piece that runs one chat turn from start to finish: save the user's message, call the model,
stream the reply back to the window, save it, then clean up. It sits between the RPC door above
([entry-rpc.md](entry-rpc.md)) and the stream engine below ([stream-engine.md](stream-engine.md)).

## What it is

This layer is the **orchestrator** of a single chat turn. An orchestrator is a coordinator: it holds
little logic of its own, and its job is to call the other pieces in the right order. (Orchestrator and
the other terms below are in the [glossary](../glossary/glossary.md).)

A "turn" is one round of the conversation: the user sends a message, the model answers. Running that
turn touches a lot of moving parts. Something has to save the user's message, look up the model and its
API key, gather the chat's context, ask the model, stream the answer back to the window word by word,
save the finished reply, and tidy up afterwards. This layer owns all of that ordering. It does not make
the model call itself; it hands that to the stream engine and waits.

It has a neighbor on each side.

| Neighbor | Direction | What it does |
|---|---|---|
| [`entry/rpc.ts`](entry-rpc.md) | above | Receives `sendMessage` / `retryFromMessage` / `cancelStream` from the window and calls in here. |
| [`engine/stream/`](stream-engine.md) | below | Makes the one model call and streams the reply. Owns no lifecycle. |

The split matters. The stream engine knows how to produce one reply and nothing else. It never touches
the database, the list of running streams, compaction, or retry. This layer owns all of that. So the
engine stays a pure "given a history, stream a reply" function, and everything stateful lives here.

## The four files

| File | Lines | Role |
|---|---|---|
| [`chat-stream.service.ts`](../../src/bun/engine/chat-stream/chat-stream.service.ts) | ~340 | The orchestrator. `startChatStream`, `retryChatStream`, `cancelStream`, plus the two push-channel setters. |
| [`approval-registry.ts`](../../src/bun/engine/chat-stream/approval-registry.ts) | ~46 | Tool approval. Parks a turn on a promise until the user decides, and settles all pending on teardown. |
| [`context-window.ts`](../../src/bun/engine/chat-stream/context-window.ts) | ~44 | Pure compaction math: estimate the token count, decide if it crossed the threshold. Already tested. |
| [`features/chat/chat.repository.ts`](../../src/bun/features/chat/chat.repository.ts) | ~270 | Persistence for the chat and message pair: create, read, update, truncate, save. |

## How a turn flows, start to finish

The entry point is `startChatStream`. Read from the top, a turn goes like this.

**1. Save the user's message.** `createUserMessage` writes the user turn to SQLite. It also turns any
attachment ids into image or file parts. If an attachment row has vanished (deleted mid-send) it skips
that one rather than failing the whole message.

**2. Look up the model and key.** `launchTurn` fetches the model by id (throws `Unknown model` if gone)
and its API key from the keychain (throws `No API key configured` if missing). It does this **first,
before registering anything**, so a preflight failure throws straight back to the caller without leaving
a dead entry behind (see [Concerns and footguns](#concerns-and-footguns)).

**3. Register the stream.** `launchTurn` mints a `streamId` and an **AbortController**. An AbortController
is the standard browser and Node object for cancelling in-flight work: it carries a `signal`, and calling
`.abort()` on the controller flips that signal, which the model call watches. The controller goes into
`activeStreams`, a `Map` from `streamId` to controller. That map is the single place the app looks to find
and cancel a running stream later. It then mints the assistant message id and emits a `start` chunk
carrying that id, so the window can show an empty assistant bubble immediately.

**4. Gather context.** Before streaming, `gatherTurnContext` collects what the engine will need: the
chat's saved tool grants, its project (if any), the titles of the global and project memory slices, and
the project file names. `launchTurn` also builds `gateApproval`, the function the engine calls when a tool
needs the user's approval (see [Tool approval](#tool-approval) below).

**5. Run the turn, detached.** The real work happens in `runTurn`, an async block that is started but not
awaited. This is **fire-and-forget**: `launchTurn` returns the stream id and assistant message id right
away, while `runTurn` keeps working in the background. Progress reaches the window later as stream chunks.
This mirrors the control server's "reply 202 now, stream the rest" shape. Inside `runTurn`, in order:

  - **The `compaction` stage**, fired via `dispatchStage`: if the chat is too long, its action
    (`maybeCompact`, now in `compaction.service.ts`) summarizes the older turns first. Non-fatal: a
    failure just logs and the turn proceeds with the full history. See [Compaction](#when-it-compacts)
    and [lifecycle.md](lifecycle.md).
  - `getLatestSnapshot` — load the current compaction summary, if one exists, to pass to the engine.
  - `runStream(...)` — the one call into the stream engine. It streams the reply, emitting each fragment
    through `onChunk`, and returns the finished `parts`, `usage`, and `stopReason`.
  - `saveAssistantMessage` — write the reply to SQLite. One exception: if the turn was stopped and
    produced nothing (`stopReason && parts.length === 0`), it saves nothing and `saved` stays undefined.
  - Emit the `done` chunk carrying the saved message, then fire the **`auto-title` stage** via
    `dispatchStage` (also non-fatal): while the chat is still called "New Chat", its action names it from
    the first user message with a cheap model. It runs every turn and is idempotent, so a title that
    failed to generate earlier self-heals on a later turn.

**6. On error, tell the window.** If anything in `runTurn` throws, the `catch` emits an `error` chunk with
the message. The turn ends without crashing the process.

**7. Always clean up.** The `finally` block runs whether the turn succeeded, failed, or was cancelled. It
settles any pending tool approvals for this stream and deletes the stream from `activeStreams`.

### Two ways the turn reports progress

There are two separate notification paths, and it helps to keep them apart.

- **Stream chunks** go to the window through `emitChunk`. Each chunk is a small event like `start`,
  `textDelta`, `reasoningDelta`, `compacting`, `done`, or `error`. `emitChunk` sends the chunk on the
  `streamChunk` push channel and also to an optional `onChunk` callback.
- **Lifecycle events** are a coarser `started` / `done` / `error` signal sent to an optional `onLifecycle`
  callback. The window does not need this; the control server does, so an outside program following the
  turn learns when it started and finished. Note that `started` does not fire when the turn begins. It
  fires on the first real text or reasoning fragment, so it means "the model has begun answering."

## Retry and cancel, versus a fresh send

`retryChatStream` reuses the same `launchTurn` machinery but prepares the history differently first. If
the user edited the message, it updates that message's text. Then it calls `truncateMessagesAfter`, which
**deletes every message after the edited one**. Only then does it regenerate. It passes no original
content, so a retried turn never triggers auto-title.

`cancelStream` is the counterpart to `launchTurn`. It settles the stream's pending approvals, calls
`.abort()` on the stored controller with a `user-cancel` reason, and deletes the stream from
`activeStreams`. The abort flows down into the running model call, which stops.

## Tool approval

When a tool needs the user's say-so, the turn has to pause and wait for a decision that arrives on a
totally separate RPC call. The app solves this with a **promise registry**: a small module that hands out
promises and keeps the means to settle them for later.

That module is `approval-registry.ts`. It keeps one `Map` called `pending`, keyed by `streamId:toolCallId`.

- `awaitApproval(streamId, toolCallId)` creates a promise, stores its `resolve` function in the map, and
  returns the promise. The turn awaits it and parks.
- `resolveApproval(streamId, toolCallId, decision, remember)` is called from `rpc.ts` when the user clicks
  allow or deny. It looks up the stored `resolve`, deletes the entry, and settles the promise. The parked
  turn wakes up with the decision.
- `settlePendingApprovals(streamId)` denies every still-pending approval for a stream. It runs on `done`,
  `error`, and `cancel`, so no promise is ever left dangling.

This pattern, pausing work until a person decides, is called **human-in-the-loop** approval. The actual
gating logic (global policy first, then per-chat grant, then ask) lives in the stream engine's tool gate,
not here; this layer only supplies the park-and-settle promise. See [tools.md](tools.md) and the tool-gate
section of [stream-engine.md](stream-engine.md).

## When it compacts

`maybeCompact` is the automatic trigger, run once before each turn. It estimates the chat's token count,
compares it to the model's threshold, and if the chat is over, it summarizes the older turns in place. It
emits a `compacting` chunk (active true, then false) around the work so the window can show a divider.

Two developer overrides can force the behavior for testing: `forcedContextTokens` pins the token estimate,
and `compactionRatio` pins the threshold fraction. Both keys come from the shared `DevOverrideKey` enum, so
the renderer that sets them and this code that reads them cannot drift apart. The full mechanism (how the
summary is built and stored, and how the engine sends `summary + recent tail` afterwards) is in
[compaction.md](compaction.md). The token math itself lives in `context-window.ts` and is already tested.

## Persistence: what a chat and a message look like

`chat.repository.ts` is the one module that owns both the `chats` and `messages` tables. Rows come out of
the database as untyped shapes, so every read parses the row through its schema into a checked object
before returning it, `chatRowToDTO` and `messageRowToDTO`. That is the parse-at-the-boundary rule applied
at the database edge.

A chat carries a title, an optional project id, the model last used, a `composer` blob (which holds the
saved tool grants), and three timestamps. A message carries its role (user or assistant), its `parts`
(text, image, file, reasoning, tool-call), optional token `usage`, and an optional stop reason. Every
write also bumps the chat's recency so it sorts to the top of the list. The lower-level table and column
details are in [infra-db.md](infra-db.md).

## Patterns and things to watch

### Patterns

- **Module-singleton dependency injection.** The service keeps two empty slots, `sendToWebview` and
  `sendChatsUpdated`, filled at startup by `index.ts`. These are the `streamChunk` and `chatsUpdated`
  entries in the five-channel push table in [entry-rpc.md](entry-rpc.md). The service never imports upward
  to reach the window; it waits to be handed the senders.
- **Fire-and-forget.** The turn runs detached so the caller gets the assistant id at once. Progress
  arrives as chunks.
- **The cancellation substrate.** `activeStreams` is the one map that makes cancel possible: register in
  `launchTurn`, look up and abort on cancel, delete in `finally`.
- **Non-fatal side quests.** Compaction and auto-title run as actions dispatched to the `compaction` and
  `auto-title` stages; `runActions` isolates each so a failure only logs and the turn continues, the same
  spirit as the never-throw logger. See [lifecycle.md](lifecycle.md).
- **Lazy attachment resolution.** The engine gets a `resolveAttachment` function rather than the bytes up
  front, so an attachment is read from disk and base64-encoded only if the turn actually needs it.

### Concerns and footguns

- **Retry deletes the tail before it regenerates.** `truncateMessagesAfter` drops everything after the
  retried message first. If the regenerated turn then fails, the chat is left with just the user message
  and an error. The old reply is already gone.
- **No single-flight guard per chat.** Nothing here stops two streams running on the same chat at once;
  both would write. A single-flight guard means "only one of these can be in progress at a time." This
  layer does not enforce it, so the window is expected to prevent a second send while one is streaming.
- **An empty stopped reply is not saved.** When a turn is stopped before it produces anything, `saved`
  stays undefined, so the `done` chunk's `message` can be undefined. The renderer must handle a `done`
  with no message.
- **`gateApproval` ignores the tool name and input.** Approvals are keyed only on `streamId:toolCallId`,
  so `gateApproval` takes the tool name and input but does not use them. That is fine: the tool's name and
  arguments reach the window separately, in the `tool-approval-request` chunk the gate emits. See
  [stream-engine.md](stream-engine.md).
- **Preflight errors surface as an RPC rejection, not a chunk.** `resolveModelAndKey` runs **first** in
  `launchTurn`, before the stream is registered, so an unknown model or a missing API key throws straight
  back to the RPC caller with nothing left in `activeStreams`. The trade-off is that a preflight failure
  never reaches the chat as an `error` chunk, since no stream exists yet. If the "no API key" path ever
  needs to show as a normal in-chat error, that would mean registering first and moving the resolve inside
  `runTurn`'s `try` instead.

## Named constants

- `DEFAULT_COMPACTION_RATIO = 0.8` (`context-window.ts`) — compact once the estimate passes 80% of the
  window.
- `CHARS_PER_TOKEN = 4` (`context-window.ts`) — the fallback token estimate when no provider count exists.
- `DEFAULT_CONTEXT_WINDOW = 200_000` (`context-window.ts`) — used when a model does not advertise its own
  window.

## Tests

- `context-window.test.ts` covers the pure math: the token estimate (provider count preferred, char/4
  fallback) and the threshold check. It is fast because the file is a pure leaf.
- `approval-registry.test.ts` covers the registry: `resolveApproval` settles the awaited promise;
  `settlePendingApprovals` denies every pending call for a stream; a resolve after settle is a harmless
  no-op; two streams stay isolated.
- `chat-stream.service.test.ts` covers one behavioral slice: the preflight leak fix. It uses `mock.module`
  to override the three functions the preflight path calls (`getModel`, `getApiKey`, `createUserMessage`,
  each spreading the real module) and asserts that an unknown model or a missing key throws while
  `activeStreams` stays empty. The turn body itself has no test: it is orchestration over the database, the
  keychain, and the engine, so exercising it would drag in the whole IO graph.

## Links

- Above it: [entry-rpc.md](entry-rpc.md) — the RPC door, and the five-channel push table.
- Below it: [stream-engine.md](stream-engine.md) — the one model call, the tool gate, abort handling.
- [compaction.md](compaction.md) — how the summary is built, stored, and sent.
- [lifecycle.md](lifecycle.md) — the stages and the dispatch seam that runs compaction and auto-title.
- [model.md](model.md) — model lookup and the title model used by auto-title.
- [attachments.md](attachments.md) — how attachment bytes are stored and resolved.
- [memory.md](memory.md) — the memory slices whose titles are gathered for the prompt.
- [infra-db.md](infra-db.md) — the `chats` and `messages` tables.
- [tools.md](tools.md) — the tool set and the permission gate behind `gateApproval`.
- [../glossary/glossary.md](../glossary/glossary.md) — orchestrator, fire-and-forget, AbortController,
  promise registry, single-flight, human-in-the-loop.
- [../architecture.md](../architecture.md) — the two-process model and how a message flows end to end.
