# Proxima

A desktop chat app for working with language models through your own API keys. No provider is
favored: each one plugs in behind the same seam, and Anthropic and OpenRouter are supported today.
Everything stays on your machine.

Proxima is pre-alpha and runs on macOS only.

## What it does

- Chats, optionally grouped into projects. A project carries its own system prompt, files and
  memory.
- Image and PDF attachments, and extended thinking, when the chosen model supports them.
- Memory: durable notes that carry across chats, written by you or by the model through a tool.
- Tools the model can call during a turn (memory, web search), each gated by an allow, ask or deny
  policy you set.
- Automatic compaction: long chats are summarized in place so they keep fitting the context window.
- Prompt caching on the stable system and memory blocks, to cut cost.
- Streaming markdown with syntax highlighting, in-chat find, chat search, and a focus mode for
  reading one exchange at a time.
- An optional local control server (off by default, bound to `127.0.0.1`) so scripts on your own
  machine can send prompts to the app.

## Who it's for

People who use models from more than one provider and want one native app for it: their own keys,
chats organized by project, and no account or cloud sync.

## Built with

- Electrobun: a Bun main process and a WebKit renderer
- React and TypeScript, styled with Tailwind
- SQLite through `bun:sqlite` and Drizzle
- Vercel AI SDK, with one adapter per provider
- TanStack Query, Zustand, React Hook Form and Zod
- Biome for linting and formatting

## Running it

You need macOS and [Bun](https://bun.sh) (developed on 1.4).

```sh
bun install
bun run start
```

`start` builds the renderer and opens the app. Add an API key in **Settings → Providers**, and the
model list syncs from that provider.

| Command | What it does |
|---|---|
| `bun run dev:hmr` | Runs the app with hot reload. Also serves the renderer at `localhost:5173`, so you can debug it in a browser against the running app. Dev only. |
| `bun run build` | Builds the packaged app into `build/`. |
| `bun test` | Runs the unit tests. |
| `bun run typecheck` | Type-checks the project. |
| `bunx biome check .` | Lints and checks formatting. |
| `bun run eval` | Runs the memory-behavior tests in `evals/` against a real model. Needs an OpenRouter key saved in the app, and makes paid model calls. |

## Where your data lives

- Chats, projects, memory and settings: one SQLite file, `proxima.db`, in the app's user-data
  folder. Attachments and project files sit on disk next to it.
- API keys: the macOS Keychain, under the service `com.proxima.apikeys`. They never touch the
  database.
- Network calls go to the model providers (your chat requests and their model lists) and to
  Google's favicon service, to show the icons of web-search sources. There is no telemetry.

## Docs

[docs/](docs/README.md) explains how the app is built: start with the
[architecture overview](docs/architecture.md). Planned work is in [ROADMAP.md](ROADMAP.md).

## License

MIT. See [LICENSE](LICENSE).
