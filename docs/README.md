# Proxima docs

Proxima is a desktop chat app for talking to large language models: chats grouped into projects, with
attachments, thinking, memory, and tools. It is built on Electrobun (a Bun main process plus a WebKit
renderer), React and TypeScript, Drizzle and SQLite, and the Vercel AI SDK.

These docs are written to be read one part at a time. Each explains the why, not just the what, and
defines its terms as it goes. If you are new here, start with the architecture overview, then dip into
whichever area your task touches.

## Start here

**[architecture.md](architecture.md)** — the map of the whole app: the two-process model, how a message
flows from send to reply, the folder layout, storage, streaming, and IPC. It stays high level and points
at the reference docs for the detail.

## The four areas

- **[conventions/](conventions/)** — how code is written in this repo, the decisions that are easy to get
  wrong or worth an explanation. [style](conventions/style.md) (naming, control flow, comments),
  [react](conventions/react.md) (the no-`useEffect` rule, hooks through `React.*`),
  [data-and-state](conventions/data-and-state.md) (TanStack Query, forms, Zustand),
  [architecture](conventions/architecture.md) (where a file goes, what a contract is, when a repository is
  earned), and [webkit-quirks](conventions/webkit-quirks.md) (the WebKit and Electrobun rendering gotchas).

- **[features/](features/)** — one doc per user-facing feature, describing what it does and how it is built:
  [chat](features/chat.md), [projects](features/projects.md), [settings](features/settings.md),
  [sidebar](features/sidebar.md), [models](features/models.md), [focus-mode](features/focus-mode.md), and
  [devtools](features/devtools.md).

- **[reference/](reference/)** — the deep dives the overview points at, one per subsystem: the RPC door and
  the shared contract, the chat-stream orchestrator and the stream engine, the database, models, memory,
  tools, compaction, attachments, the control server, and the infra singletons (keychain, LLM, logging).

- **[glossary/](glossary/)** — plain definitions of the terms these docs use, each with a real example from
  this app, plus the explanation style the docs follow.
