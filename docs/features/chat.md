# Feature: chat

## Purpose

The core surface of the app: the conversation. `ChatView` is the main pane when a chat is selected,
with an overlay header (project and title, focus-mode plus actions), the scrolling `MessageList`, and
the docked `MessageInput` composer. When no chat is selected it shows `WelcomeComposer`, the new-chat
composer. This feature owns rendering a message (text, reasoning, tool calls, sources, attachments,
usage), the live streaming turn, both composers, model selection, and the context and compaction
affordances. It is the largest feature, at 42 files. Its backend counterpart is documented in
[../reference/chat-bun.md](../reference/chat-bun.md).

**Location:** `src/mainview/features/chat/`

**Depends on:** shared root (`lib/{query-client,query-keys,rpc.client,markdown}`, many `components/*`
primitives and `components/icons/*`, `entities/model/*`, `hooks/use-mount-effect`,
`utils/{tailwind-class-merge,format-tokens,format-duration,format-bytes,capitalize,error-message}`);
shared-contracts (`schemas/{message,chat,attachment}.schema`, `tools/{tool-catalog,tool-policy}`,
`rpc/stream-chunk`, `models/effort`, `providers/registry`); the models feature (`useModels`) and the
settings feature (`useSettings`, `useApiKeyStatuses`). Consumed by sidebar, projects, and focus-mode.

## Structure

The full feature shape. The one hot store is `chat.store`; `lib/` holds the streaming glue (the
bun-to-store bridge) that is neither a pure helper nor a hook. `focus-mode` is a separate feature that
reuses this one's streaming message and `useMessages`, so its docs live in
[focus-mode.md](focus-mode.md).

| Path | Responsibility |
|---|---|
| `components/chat-view.tsx` | The main pane: header (project and title, focus button, `ChatActionsMenu`), `MessageList`, `MessageInput`. Computes `ctxUsage` (with the devtools token faker) and the context-ring tooltip. Falls back to `WelcomeComposer`. Keys `MessageList` on chat id so scroll state resets per chat. |
| `components/message-list.tsx` | The scroll container: the message map, the compaction divider, the live `StreamingMessageView`, the streaming-error banner, and the scroll-to-bottom affordance (`useAutoScroll`). |
| `components/message-bubble.tsx` | Role dispatch (memoized): `UserMessage` (bubble plus hover actions, or the inline `UserMessageEditor`) versus `AssistantMessage` (reasoning, text, sources, usage, actions, stop-reason). |
| `components/message-part-renderer.tsx` | Renders one `MessagePart` by kind: text to `Markdown`, image/file to lazy attachment renderers, tool-call to `ToolCallBlock`; reasoning, tool-result, and source render `null` (shown by their own blocks). |
| `components/{thinking-block,tool-call-block,sources-block,message-actions,attachment-chip}.tsx` | The per-part blocks: the collapsible reasoning trace; a tool call across its three states (awaiting-approval / pending / resolved) with the inline approval card; web-search sources; the retry/edit/copy hover row; an attachment chip. |
| `components/chat-row.tsx` | One chat row, rendered by the sidebar and the project view: the select button, the hover/menu-reveal actions, and the inline rename input (`ChatRowRename`). |
| `components/message-input/` (`message-input.tsx` plus `constants.ts`) | The in-chat composer: a server-backed `ChatDTO`, the model pinned via `chat.update`, the context ring plus manual compaction. |
| `components/composer-body.tsx` plus `welcome-composer.tsx` | The new-chat composer: local draft state, default-model computation, `chat.create` then send. `WelcomeComposer` is its empty-state wrapper. |
| `components/{composer-add-menu,composer-attachment-row,composer-button,model-switcher}.tsx` | The shared composer periphery: the "+" menu (attach / think / browse / effort), the pending-attachment chip row, the shared send/stop button, the model dropdown. |
| `store/chat.store.ts` | The hot Zustand store, and only what streams: the live `streaming` message (mutated on every token), `compactingChatId`, and `thinkingExpanded`. What the shell is showing lives in the root `navigation.store`. |
| `hooks/*` | Query reads (`useChats`, `useMessages`, `useCompaction`), stream and action hooks (`useStreamingMessage`, `useMessageActions`, `useCompactNow`, `usePendingAttachments`), and two named DOM hooks (`useAutoResizeTextarea`, `useAutoScroll`). |
| `lib/*` | The streaming glue: `attach-stream` (subscribe to a bun stream, drive the store), `send-turn` (the shared submit tail), `active-chat-reporter` (control-server integration), `jump-into-stream` (open a chat on its already-running stream, shared with focus mode), `reset-stream-on-navigation` (drop the live stream when the open chat changes), `copy-message`, `tool-summary`. |
| `entities/` · `helpers/` | `entities/`: `chat-title` (the Untitled fallback), `context-usage` (token-window math). `helpers/`: `message-parts` (part extractors), `composer-capabilities`, `reconcile-composer`, `send-key`. |
| `chat.api.ts` · `attachment.api.ts` | Chat CRUD plus the optimistic user message and cache invalidations; the `useAttachment` query. |

## Data flow

Saved messages are TanStack Query: `useMessages(chatId)` reads `listMessages` keyed by
`queryKeys.messages`. The live turn is the store: sending calls `send-turn` (flush staged attachments,
an optimistic user message, the `sendMessage` RPC, invalidate, then `attachToStream`). `attach-stream`
subscribes to the bun `streamChunk` push channel and drives `chat.store` chunk by chunk
(`appendTextDelta`, `addToolCall`, `setToolCallAwaitingApproval`, `addSource`, and so on). On the
`done` chunk it invalidates messages, compaction, and the chat list, so the finished turn re-reads
from the DB and the store's `streaming` is dropped. So the query layer owns saved history, and the
store owns only the in-flight turn.

Two composers, one tail. `MessageInput` (an existing chat) and `ComposerBody` (a new chat) own
different heads, server-backed versus local draft, `chat.update` versus `chat.create`, and share the
periphery and the `sendTurn` tail. Tool approval round-trips out of band: the approval card calls
`resolveToolApproval` on its own RPC, and the decision comes back as a later stream chunk. External
prompts (the control server) enter through `app/on-control-navigate`, which selects the chat and
attaches to the already-running stream. That policy lives in `app/` because it spans three
features; the chat-side half of it is `lib/jump-into-stream`.

## Key decisions

- **Two composers, shared periphery, not merged.** New-chat and in-chat differ at the core (state
  ownership plus the submit head); a flag-driven `<Composer mode>` would be the wrong abstraction. The
  periphery (`composer-*`, `model-switcher`, `send-key`, `reconcile-composer`, `composer-capabilities`)
  and the `send-turn` tail are shared; the two centers stay separate.
- **`chat.store` is the one hot store, so per-field selectors are mandatory.** It mutates on every
  streaming token; a selector-less `useChatStore()` re-renders the subtree on every token. Every consumer
  reads per-field (`useChatStore((s) => s.field)`). See
  [../conventions/data-and-state.md](../conventions/data-and-state.md).
- **Streaming lives in the store, not the query cache.** The in-flight turn is ephemeral UI state with
  no server identity yet; mirroring it into the query cache would fight the query layer's ownership of
  saved data. On `done` the store hands off to a fresh `useMessages` read.
- **Auto-scroll is quarantined in a named DOM hook.** Stick-to-bottom is an irreducible recurring DOM
  side effect (measure distance-from-bottom, then scroll), so `use-auto-scroll` holds the effects rather
  than leaving them loose in `MessageList`. See [../conventions/react.md](../conventions/react.md).
- **The rename form and edit form mount only while open.** `RenameDialogForm` (in `chat-actions-menu`)
  and `UserMessageEditor` (in `message-bubble`) mount conditionally, so they seed fresh from the message
  each time and reset by unmounting, with no re-seed effect.
- **Tool approval stays inline in `tool-call-block`.** The approval card shares `expanded` state with
  the resolved view, so extracting it buys little; it stays one component across its three render states.
- **`ThinkingBlock` formats its own duration.** All three call sites (message-list, message-bubble,
  focus-mode) pass a raw `durationMs`; the block formats with the shared `formatSeconds`. This removed
  two ternaries at the call sites and a duplicate `formatDuration` helper in focus-mode.
