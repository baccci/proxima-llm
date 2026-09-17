# The RPC layer (`src/bun/entry/rpc.ts`)

The door the app's own window uses to talk to the main process: a single file that receives every
request from the UI and forwards it to the app's core. It is the twin of the
[control server](control-server.md).

## What it is

Proxima runs as two programs at once. The **main process** does the real work: the database, the files,
and the model calls. The **renderer** is the visible window, a React web page in its own process. The two
cannot share memory, so they talk by passing messages. (Main process, renderer, and the terms below are
all in the [glossary](../glossary/glossary.md).)

`rpc.ts` is the door between them. Every time the window needs something done, it calls what looks like a
normal function, and `rpc.ts` runs the real version here. This message-passing style is called **RPC**,
short for remote procedure call.

The file holds no logic of its own. Each handler takes the request, calls into `engine/` or `features/`,
and hands back the reply. That makes it an **entry adapter**: a file at the edge of the app that turns one
kind of request into calls on the core.

It has a twin. The [control server](control-server.md) is the same idea for a different caller. Both are
entry adapters. They differ only in who is on the outside and how they connect.

| Door | Who's outside | How they connect |
|---|---|---|
| `rpc.ts` | the app's own window | Electrobun's built-in RPC |
| control server | other programs on your machine | HTTP and WebSocket |

## One file, on purpose

The control server was split into six small files, one job each. `rpc.ts` is left as a single file, and
that is the same rule at work, not a contradiction. Its one job is routing: match each request to the code
that handles it. Splitting a list of one-line handlers would scatter that single job for no gain.

## The handler map

Handlers are grouped by area. Each one is a thin call into a feature or the engine.

| Group | Handlers | Calls into |
|---|---|---|
| Models | listModels, updateModel, syncModels, getModelSyncInfo | model repository, model sync |
| Projects | listProjects, createProject, updateProject, deleteProject | project repository |
| Memory | listMemorySlices, upsertMemorySlice, deleteMemorySlice, getMemorySummary | memory repository, memory-notify |
| Project files | listProjectFiles, addProjectFile, readProjectFile, deleteProjectFile | project-file repository |
| Chats | listChats, listPinnedChats, getChat, createChat, updateChat, deleteChat, searchChats | chat repository |
| Messages | listMessages, sendMessage, retryFromMessage, cancelStream, resolveToolApproval, setActiveChat, getCompactionInfo, compactNow | chat-stream service, compaction |
| Tool policies | listToolPolicies, setToolPolicy | tool-permission repository |
| Logs | getLogInfo, openLogsFolder, openLogFile, clearLogs, logClientError | logs service |
| Attachments | uploadAttachment, getAttachment | attachment repository |
| Settings | getSettings, updateSettings | settings repository |
| API keys | setApiKey, hasApiKey, removeApiKey | keychain |
| Control server | generatePairingCode, listControlTokens, revokeControlToken | control-server/auth |
| Dev tools | devSetOverride, devForceCompact | dev-overrides (only when `TWEAK=1`) |
| App | quit | Electrobun |

## How rpc.ts talks back to the window

Most handlers answer a request and stop. But sometimes the main process needs to tell the window that
something changed on its own, with no request to reply to. Sending a message in that direction is called a
**push**.

There is a snag. To push a message, `rpc.ts` would need the window object, which is called `mainWindow`.
That object is built during startup, inside `index.ts`, and `rpc.ts` finishes loading before it exists. So
`rpc.ts` cannot just reach for `mainWindow`.

There is a second snag. The control server imports two functions from `rpc.ts`. If `rpc.ts` imported the
control server back, to start and stop it, the two files would each depend on the other in a loop. That
loop is called a **circular import**, and the module system cannot resolve it cleanly.

One trick solves both. `rpc.ts` leaves empty variables, called **slots**, plus small **setter** functions
whose only job is to fill them. During startup, `index.ts` calls the setters and hands in the real
functions. So `rpc.ts` never imports upward; it waits to be handed what it needs. Handing code its
dependencies from the outside, instead of letting it fetch them, is called **dependency injection**.

One thing to know when reading the file: this push wiring is spread across three modules, so `rpc.ts` shows
only part of it. There are six push channels in total.

| Push channel | Slot lives in | Filled by |
|---|---|---|
| modelsUpdated | rpc.ts | wireWebviewPush, in index.ts |
| controlNavigate | rpc.ts | wireWebviewPush, in index.ts |
| memoryChanged | memory-notify.ts (rpc re-exports the setter) | wireWebviewPush, in index.ts |
| streamChunk | chat-stream.service.ts | index.ts directly |
| chatsUpdated | chat-stream.service.ts | index.ts directly |
| playSound | sound-push.ts | wireWebviewPush, in index.ts |

The control server's start and stop pair is wired the same way, through `setControlServerFns`. That lets
the `updateSettings` handler turn the server on or off live when you flip its setting, without `rpc.ts`
ever importing the server.

## What gets checked at the door, and why

Untrusted data that enters the app should be checked against a **schema** right at the entry point, before
any code trusts it. A schema is a description of the exact shape the data must have. Checking it there is
called **parsing at the boundary**. Both terms are in the glossary.

Not every handler parses, and that is on purpose. The RPC connection already types each request at compile
time, and the only caller is our own window. So plain database reads and writes trust that typing and skip
a runtime check.

Parsing is reserved for the handlers where the value flows into something more dangerous than a database
row:

- `sendMessage` and `retryFromMessage` parse, because their input travels deep into the engine, which is
  the widest blast radius.
- `uploadAttachment` and `addProjectFile` parse, because their input becomes part of an on-disk file path.
  A bad value there could escape the intended folder. That escape is called **path traversal**, so both
  schemas require the id in the path to be a plain UUID with no slashes.
- `setApiKey` and `hasApiKey` parse, because the provider name reaches the keychain and must be narrowed
  from a free wire string down to the known set of providers.

In short: parse when the value reaches the file system, the keychain, a fixed set of allowed values, or the
engine. Trust the typed connection for ordinary database work.

## Concerns and things to watch

- **A push before wiring is silently dropped.** Every push goes through `mainWindow.webview.rpc?.send`. The
  `?.` means that if the window is not wired yet, or has gone away, the push quietly does nothing. That is
  intended, so early startup cannot crash on a missing window. Just know that a lost push leaves no error
  to find.
- **`updateSettings` has a hidden side effect.** Saving settings usually just writes to the database. But
  this handler also compares the control-server toggle against its previous value, and starts or stops the
  server when it changes. A settings write can turn a network server on. Worth remembering when you touch
  it.
- **Dev tools are off unless launched with `TWEAK=1`.** The `devSetOverride` and `devForceCompact` handlers
  do nothing without that launch flag. The flag is read once when the file loads, so changing it needs a
  restart.
- **The empty `messages: {}` is deliberate.** Electrobun's RPC has a separate channel for pushes, but the
  app does not use it. Every push goes through the injected `send` functions instead, as described above.

## Links

- Its twin: [control-server.md](control-server.md) — the same adapter idea, for outside programs.
- Startup wiring: [`src/bun/index.ts`](../../src/bun/index.ts) — builds `mainWindow`, calls the setters, and
  auto-starts the control server.
- [../glossary/glossary.md](../glossary/glossary.md) — RPC, entry adapter, push, dependency injection,
  circular import, schema, path traversal, and more.
- [../architecture.md](../architecture.md) — the two-process model and how a message flows end to end.
