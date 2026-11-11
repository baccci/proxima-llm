# Roadmap

Planned work for Proxima, roughly in order. Items marked *speculative* are ideas, not commitments.

## Bugs

- In-chat find: highlights vanish after a match scrolls out of view and back.
- The view scrolls up when a streamed response finishes and becomes a full message block. This was
  fixed once and came back.
- The scroll-to-bottom button shows when there is nothing to scroll, after interrupting a reply and
  editing the message.
- The Clear logs button does nothing.
- Editing a sent message: the input's max height is too small.
- Downloaded attachments lose their original filename. Needs a `name` column and a migration.
- Control server: the connected-clients list does not refresh when a new client pairs.
- Project icon color: opacity snaps to 100% when picking a new base color at 0%.
- Memory: the model sometimes saves a note when it shouldn't. Tighten the memory instructions.
- Keychain: a failed key save is only logged, so the user later sees "no API key configured" with no
  cause. Surface the failure.

## Small features

- A way to delete a project, with a confirm step and a clear rule for what happens to its chats, files
  and memories.
- A font-size control in Appearance settings. The setting already exists in the schema.
- Per-response stats behind a button (tokens in and out, tokens per second) instead of showing them on
  every turn.
- Show memory tool calls in a readable form instead of raw input and output objects.
- Background model calls (auto-title, compaction, memory summary) use a free model when the chat uses
  a free model, or let the user choose.

## Larger features

- Lifecycle hooks, next step: a durable task queue, so after-turn work that fails, like auto-title, is
  retried on the next turn.
- Chat tags, assigned on the first turn through a lifecycle hook.
- Control server: queue prompts aimed at a busy chat instead of rejecting them; add commands to read
  messages and list or create projects; let a local app request tool permissions up front.
- New tools: run terminal commands (always ask by default, with a warning when set to allow), ask the
  app for its own state, open a setting or chat in the app, and render charts.
- Long chats with large code blocks lag when opened. Find the cause and fix it.

## Code health

- One way for the renderer to reach RPC, a single accessor that waits for the client, used by every
  hook and API module.
- Move operational constants (sync URLs, throttles, sync version) into a typed config module.
- Cleanup pass: the chat-row component, named constants, and if/else chains.

## Later

- A capability-scoped API for tools, plus user plugins: each tool declares what it touches (files,
  shell, database, network) and the user grants each capability. *(speculative)*
- A theming system with user-selectable design styles. *(speculative)*
- Set tools to "ask" by default for models not tagged as good at tool use. *(speculative)*
- Windows and Linux support, starting with a keychain backend for each. *(speculative)*
- More providers beyond Anthropic and OpenRouter. *(speculative)*
