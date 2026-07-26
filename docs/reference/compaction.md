# Context compaction (`engine/compaction*` + `features/compaction/`)

How a long chat is kept inside the model's context window: detect that the chat is too big, summarize
the older turns into one dense blob, store that snapshot, and from then on send `summary + recent tail`
instead of the full log. This is the source of truth for the layer.

## The problem, in plain language

Every turn resends the **whole** chat history to the model. Two things break as a chat grows:

1. **Cost** climbs every turn: turn 50 pays to re-read turns 1 through 49.
2. **The window fills.** Each model has a fixed context window (for example 200k tokens). Past it, the
   request fails.

Compaction is the fix. When the chat gets big, the app asks a cheap model to write a **dense summary** of
the older turns, saves it as a `CompactionSnapshot`, and from then on the prompt is
`summary + the recent turns in full` rather than the entire log. Nothing is deleted: the old messages
still live in SQLite and still render in the UI. They just stop being **resent** to the model.

## The pieces

| File | Role | Kind |
|---|---|---|
| [`chat-stream/context-window.ts`](../../src/bun/engine/chat-stream/context-window.ts) | `estimateContextTokens` + `exceedsCompactionThreshold` — *should we compact?* | pure leaf |
| [`engine/compaction-selection.ts`](../../src/bun/engine/compaction-selection.ts) | `selectCompaction` — *which messages fold into the summary, and where are the boundaries?* | pure leaf |
| [`engine/compaction-prompt.ts`](../../src/bun/engine/compaction-prompt.ts) | `buildCompactionPrompt` — *render the summary prompt* (prior summary + turns as text lines) | pure leaf |
| [`engine/compaction.service.ts`](../../src/bun/engine/compaction.service.ts) | `compact` + the three entry points — orchestrate: load, select, summarize (LLM), save | IO orchestrator |
| [`features/compaction/compaction.repository.ts`](../../src/bun/features/compaction/compaction.repository.ts) | `getLatestSnapshot` / `saveSnapshot` — the one owner of the `compactionSnapshots` table | data (repository) |
| [`chat-stream/chat-stream.service.ts`](../../src/bun/engine/chat-stream/chat-stream.service.ts) | `maybeCompact` — the auto trigger, run before each stream | caller |
| [`stream/build-prompt.ts`](../../src/bun/engine/stream/build-prompt.ts) | consumes the snapshot: append summary to system, filter history | consumer |

The three pure leaves exist on purpose: the *decisions* (is the chat too big, which messages to summarize,
what prompt to send) are pure and must be testable without dragging the DB and Electrobun graph into the
test. The service keeps only the IO (DB reads, the LLM call, the DB write). See the Tests section.

## The lifecycle of one auto-compaction

Read top to bottom. It runs inside `maybeCompact` (before the model turn) and `compact`:

**1. Should we compact?** (`maybeCompact`, `context-window.ts`)
Estimate the chat's current size, then compare to the model's threshold:

- `estimateContextTokens(history)` prefers the **last assistant turn's provider-reported `inputTokens`**
  (authoritative, since the provider counted it). Only if no turn has reported usage yet does it fall back
  to a `chars / 4` heuristic over the text parts.
- `exceedsCompactionThreshold(tokens, model, ratio)` returns `tokens > contextWindow * ratio`. The default
  ratio is `0.8`, so it compacts at 80% full, leaving headroom for the next turn. A dev override can force
  the token count or the ratio.

Below threshold, return and stream with full history. Above, emit a `compacting` chunk (the UI spinner)
and call `compact`. **Compaction is non-fatal**: it runs inside a `try/catch` and a failure just logs and
proceeds with the full history (better a pricey turn than a blocked one).

**2. Which messages, and where are the boundaries?** (`compact` calls `selectCompaction`)
`compact` loads the previous snapshot and all messages, then hands the slice decision to the pure
`selectCompaction(all, prevCoveredThroughAt, keep)`:

- **Since-filter.** Drop everything the previous snapshot already covered:
  `all.filter(m => m.createdAt > prevCoveredThroughAt)`. Exclusive, since the boundary message itself was
  already summarized. The first-ever compaction (no prior snapshot) takes `all`.
- **Keep-window.** Trim the most recent `keep` messages off the summarized set with `since.slice(0, -keep)`;
  they stay in the prompt in full. This is the recency the model keeps verbatim.
- Nothing left to summarize, return `null` (a no-op).
- Otherwise return `{ toSummarize, boundary, displayBoundary }` (see The two boundaries).

**3. Summarize.** (`compact`)
Resolve the provider's **title model**, the cheap model already used for chat titles, so summarization does
not burn the main model's budget, as the **primary**; the chat's own model is the **fallback** (it just
streamed a reply, so its endpoints are live). `buildCompactionPrompt(prevSummary, toSummarize)` renders a
plain-text prompt (any prior summary, then the turns as `User:` / `Assistant:` lines), and `runResilientStep`
runs `generateText` on the primary, then the fallback if the primary's model is dead, bounded by
`AbortSignal.any([userCancel, timeout])` so a slow model cannot stall the stream start. A user-cancel or
timeout aborts without falling back; every attempt failing, or an empty summary, is a no-op.

**4. Save.** (`compact` calls `saveSnapshot`)
Persist the snapshot: `summaryText`, the `boundary` (as `coveredThroughAt` plus id) and the `displayBoundary`
(as `displayThroughAt`). Return `{ status: ok, summarized: N }`.

**5. Next turn consumes it.** (`build-prompt.ts`)
On the following stream, `getLatestSnapshot` is read and passed into prompt assembly:

- `buildSystem` appends `## Earlier conversation summary\n{summaryText}` to the system prompt.
- `toCoreMessages` filters history to `m.createdAt > snapshot.coveredThroughAt`.

So the model receives `system (+ summary) + the tail newer than the boundary`, never the full log.

## The two boundaries (the crux)

A snapshot stores **two** timestamps, and confusing them is the easy mistake. They mark two different
lines because the model and the UI care about different things.

- **`coveredThroughAt` = `boundary` = the last *summarized* message.** This is the **model** seam.
  Everything at or before it is represented by the summary; everything after it is resent in full. Set from
  `toSummarize.at(-1)`.
- **`displayThroughAt` = `displayBoundary` = the chat tail at compaction time.** This is the **UI** seam,
  where the renderer draws the "context compacted" divider. Set from `since.at(-1)` (the newest message
  overall, not the newest *summarized* one).

The gap between them is the **keep-window**: the recent messages that were trimmed off the summary. They
sit *after* the model boundary (so the model still gets them in full) but *before* the UI divider (so the
user sees the divider at the bottom of the existing conversation, with new turns accruing below it).

```
   ... older turns ...
   [ summarized ]              <- folded into summaryText
── coveredThroughAt (boundary) ──  model seam: summary replaces everything above
   [ keep-window turns ]       <- still sent to the model in full
── displayThroughAt (displayBoundary) ──  UI divider renders here
   (new turns land below)
```

Why put the divider at the tail rather than at the model seam? Because to the user the message is "the
conversation up to now has a summary". Drawing the divider mid-conversation would wrongly suggest the
keep-window messages were dropped, when they are still fully present and still sent. The keep-window
distinction is invisible to the user and real to the model.

The renderer reads both through the `getCompactionInfo` RPC (which returns
`{ coveredThroughAt, displayThroughAt }`) to place the divider. `displayThroughAt` falls back to
`coveredThroughAt` for old rows written before the column existed.

## Three entry points, three keep-windows

All three call the same `compact`; they differ only in `keep`:

| Entry point | Trigger | `keep` | Why |
|---|---|---|---|
| `compact` (auto) | `maybeCompact`, over threshold | `KEEP_RECENT = 15` | Keep a healthy recent window verbatim on the automatic pass. |
| `compactChatNow` | user clicks the context ring (`compactNow` RPC) | `MANUAL_KEEP_RECENT = 6` | An explicit "free up context now" action keeps a **smaller** window, so clicking right after an auto-compaction still does something instead of being a no-op. |
| `forceCompactChat` | dev tool (`devForceCompact` RPC, gated by `DEV_TOOLS_ENABLED`) | `0` (summarize all) | So even a short test chat produces a snapshot. |

`keep = 0` is the footgun below.

## The RPC result shape

The RPC return type `CompactResult` uses `COMPACT_STATUS` and `COMPACT_NOOP_REASON` `as const` objects in
[`shared-contracts/rpc/compact-result.ts`](../../src/shared-contracts/rpc/compact-result.ts). Both bun and
the renderer read it, so it earns its place in shared-contracts.

## Concerns / footguns

### `keep <= 0` and the `slice(0, -0)` trap
`selectCompaction` cannot write `since.slice(0, -keep)` unconditionally: in JS `-0 === 0`, so
`slice(0, -0)` is `slice(0, 0)` = `[]`, which would summarize **nothing** exactly when `keep = 0` means
summarize **everything**. It is guarded explicitly: `keep > 0 ? since.slice(0, -keep) : since.slice()`.
Pinned by a test.

### The reasoning-undercount bug
`estimateContextTokens`'s `chars / 4` fallback counts only `text` parts and **skips `reasoning` parts**.
But `toCoreMessages` folds reasoning into the text it resends. So for thinking-heavy chats the estimate
**undercounts** the real context, and auto-compaction can fire late (or the window overflows first). This
is the fallback path only: when the provider reported an authoritative `inputTokens`, that count already
includes everything. Fix-or-confirm-intended is still open.

### The summary is built from **text only**
`buildCompactionPrompt` folds only `text` parts into the summary; it drops tool calls, tool results, and
reasoning. For a summary of "key decisions and facts" this is mostly fine, but note that context living
**only** in a tool result (for example a fetched value the assistant then relied on) is not carried into
the summary. Intended-versus-limitation is worth revisiting if summaries ever feel lossy.

### Compaction is best-effort
Non-fatal by design (lifecycle step 1). A failed or empty summary leaves the previous snapshot in place
and the turn proceeds with whatever history it has. It never blocks a reply.

### The since-filter compares ISO strings
`m.createdAt > prevCoveredThroughAt` is a lexicographic string compare, which is correct **because**
`createdAt` is an ISO-8601 timestamp (lexical order equals chronological order). It relies on the boundary
message's timestamp being strictly less than the next message's; ties at the exact boundary are an
unlikely but real edge.

## Named constants

- `KEEP_RECENT = 15` — recent turns kept verbatim on the automatic pass.
- `MANUAL_KEEP_RECENT = 6` — the smaller window for the explicit "compact now" click.
- `DEFAULT_COMPACTION_RATIO = 0.8` — compact at 80% of the window.
- `DEFAULT_CONTEXT_WINDOW = 200_000` — the fallback window when the model advertises none.
- `CHARS_PER_TOKEN = 4` — the rough estimate when no provider token count exists.

## Tests

- [`compaction.service.test.ts`](../../src/bun/engine/compaction.service.test.ts) (5) — despite the name,
  tests the pure `selectCompaction`: keep-window trim, **`keep = 0` summarizes all (footgun pinned)**,
  short/empty to `null`, the previous-snapshot exclusive filter, and `displayBoundary` is the chat tail
  (not the last summarized message).
- [`context-window.test.ts`](../../src/bun/engine/chat-stream/context-window.test.ts) (14) —
  `estimateContextTokens` (authoritative-usage preference, `chars/4` fallback, non-text ignored) and
  `exceedsCompactionThreshold` (boundary exclusive, default-window fallback, pins the `0.8` default).
- [`compaction-prompt.test.ts`](../../src/bun/engine/compaction-prompt.test.ts) (6) —
  `buildCompactionPrompt`: no-prior-summary versus prepended prior summary, `user`/`assistant` to `User:` /
  `Assistant:`, multiple text parts joined, non-text parts dropped, and a text-less turn emits no line.

**Not unit-tested:** the IO parts of `compact` (the LLM call, the DB round-trips), which are integration
surface, not covered here.

## Links

- [stream-engine.md](stream-engine.md) — the turn that consumes the snapshot (`buildSystem` /
  `toCoreMessages`); see its "Compaction snapshot splits the prompt" note.
- [chat-bun.md](chat-bun.md) — `maybeCompact`, the auto trigger that runs before each stream.
- [../architecture.md](../architecture.md) — process model, IPC, DB.
