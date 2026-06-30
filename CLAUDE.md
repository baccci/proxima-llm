# Proxima

A desktop LLM chat app — projects, chats, attachments, thinking — for Anthropic
models, built to extend to other providers (OpenRouter). Electrobun (Bun main process + WebKit
renderer), React + TypeScript + Tailwind, Drizzle/SQLite, Vercel AI SDK.

## Before finishing any change

- `bun run typecheck` and `bunx biome check .` must be clean. Typecheck has 3
  known-baseline errors (`three` types, `React.use` ×2) — ignore only those.
- Let Biome fix formatting/lint/imports: `bunx biome check --write <paths>`.

## Read when relevant — don't load these unless the task touches them

| File                                                     | Read when…                                                                                                                                                    |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [local-docs/ARCHITECTURE.md](local-docs/ARCHITECTURE.md) | adding files/features, choosing `entities/` vs `helpers/`, or touching IPC / DB / streaming. The source of truth for stack, process model, and folder layout. |
| [docs/coding-style.md](docs/coding-style.md)             | writing or moving any file — naming, constants vs inline, file separation.                                                                                    |
| [docs/react.md](docs/react.md)                           | writing components or hooks — the no-`useEffect` rule, hook namespace, conditional rendering.                                                                 |
| [docs/data-and-state.md](docs/data-and-state.md)         | fetching data, building forms, or holding UI state.                                                                                                           |
