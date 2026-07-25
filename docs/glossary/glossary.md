# Glossary

Plain definitions for the terms used across these docs when explaining the codebase. Grouped by area.
Each entry gives a definition, and where it helps, a real example from this app.

See [README.md](README.md) for the explanation style these definitions follow.

## App plumbing

**Main process** — The background part of the app, written for Bun. It talks to the database, the file
system, and the model providers. You never see it directly.

**Renderer** — The visible window. It is a web page (React) running in its own separate process. It
cannot touch the database or files directly, so it asks the main process to do that work.

**Two-process model** — The app runs as two programs at once: the main process and the renderer. They
can't share memory, so they talk by passing messages.

**IPC (inter-process communication)** — The general name for those messages passed between the two
processes.

**RPC (remote procedure call)** — A specific, convenient form of IPC. The renderer calls what looks like
a normal function, and the main process runs the real version on the other side.
*In this app:* the window calls `rpcRequest().listChats()`, and the main process runs the real
`listChats` handler in `rpc.ts`.

**Entry adapter** — A file at the edge of the app that turns an outside request into a call on the app's
core. It holds no logic of its own; it just receives, forwards, and shapes a reply.
*In this app:* `rpc.ts` (for the app's own window) and the control server (for outside programs) are the
two entry adapters.

**Push (push channel)** — A message the main process sends *to* the renderer without being asked, to
announce that something changed. The opposite direction from a normal request.
*In this app:* when the model list changes, the main process pushes `modelsUpdated`, and the window
refreshes.

**FOUC (flash of wrong theme)** — A cold start where the page paints one theme for a frame or two, then
switches once the real setting loads. It happens when the HTML ships with a fixed theme but the true
choice arrives later, from storage or a query. The fix is to decide the theme *before* the first paint,
in a tiny synchronous script in the page head, so the correct one is applied from frame zero.
*In this app:* the window shell used to hardcode `class="dark"`, so a light-mode user saw a dark flash on
launch. A boot script in `index.html` now reads the theme cached in `localStorage` (written by
`use-apply-theme`) and sets the class before React mounts.

## Code patterns

**Dependency injection** — Handing a piece of code the things it needs from the outside, instead of
letting it fetch them itself. It keeps files from importing each other in tangles.
*In this app:* during startup, `index.ts` hands `rpc.ts` the function that sends messages to the window.

**Circular import** — When two files each import from the other, forming a loop the module system can't
resolve cleanly. It's usually a sign the wiring should be inverted, often with dependency injection.

**Module singleton** — A file that loads once and keeps some state in variables at the top. Everyone who
imports it shares that single copy.
*In this app:* `rpc.ts` keeps the current chat id and its injected sender functions this way.

**Slot and setter** — A "slot" is an empty variable a module will fill in later. A "setter" is a small
function whose only job is to fill that slot. Together they let startup code inject what a module needs.

**Pure function** — A function whose result depends only on its inputs, with no side effects like reading
a file or a database. Easy to test, because you just check the output for a given input.

**Pure leaf** — A file that holds only pure functions and imports only types and schemas. It's a "leaf"
because it sits at the end of the import chain and drags nothing heavy behind it. Putting logic in a leaf
keeps its tests fast.

**Custom hook** — A reusable function whose name starts with `use` that bundles related React state and
behavior behind a small interface, so a component can call it instead of holding that logic itself.
*In this app:* `useCompactNow(chatId)` owns the manual-compaction state and action; the component just calls it.

**Cohesion** — How well the parts inside one unit belong together because they serve a single job. High
cohesion (everything in the file is about one concern) is what makes a hook or module worth extracting.

**Container hook (god hook)** — The anti-pattern of moving a whole component's state and handlers into one
big hook that returns a dozen unrelated values. It relocates the code without separating concerns and is
never reused, so the complexity is unchanged. Extract *cohesive* hooks instead, one concern each.

**Wrong abstraction** — Merging two things that look similar on the surface but differ at their core, so the
"shared" version fills up with `if (mode === …)` branches to serve both. It's harder to change than the
duplication it replaced. Rule of thumb: merge only when both callers use a clean, flag-free interface;
otherwise share the edges (the parts that are truly one concern) and let each keep its own center.
*In this app:* the two composers (new-chat vs in-chat) share a periphery but keep separate submit/state cores.

**Schema** — A description of the exact shape a piece of data must have. The `zod` library checks real
data against it.
*In this app:* `SaveAttachmentInput` is a schema saying an upload must have a `chatId`, `name`, `data`,
and `mediaType`.

**Parse at the boundary** — Checking untrusted incoming data against a schema right where it enters the
app, before any code trusts it. Wrong shape gets rejected on the spot.

**DTO (data transfer object)** — A plain, checked object used to carry data between layers, such as from
the database out to the window.
*In this app:* `ProjectFileDTO` is the shape a project file takes when it's handed to the window.

**Discriminated result** — A return value that is either a success or a failure, each carrying its own
fields, with a flag that tells them apart. It lets the caller handle expected failures as ordinary data
instead of throwing an error.
*In this app:* `resolvePromptRequest` returns `{ ok: true, ... }` or `{ ok: false, response }`.

**Orchestrator** — A coordinator that holds little logic of its own; its job is to call the other pieces
in the right order.
*In this app:* `chat-stream.service.ts` orchestrates one chat turn: save the message, gather context,
call the stream engine, save the reply, clean up.

**Fire-and-forget** — Starting a piece of async work without waiting for it to finish. The caller returns
right away, and the work reports back later by another channel.
*In this app:* `runStreamForChat` returns the assistant message id at once while the turn keeps streaming
in the background; progress arrives as stream chunks.

**AbortController / abort signal** — The standard object for cancelling in-flight work. The controller
carries a `signal`; calling `.abort()` flips the signal, and any work watching it stops.
*In this app:* each running stream has a controller in the `activeStreams` map; `cancelStream` aborts it,
and the abort flows down into the model call.

**Promise registry** — A small module that hands out promises and keeps their `resolve` functions so
they can be settled later, from somewhere else entirely. It lets one piece of code park while another
decides the outcome.
*In this app:* `approval-registry.ts` parks a turn on a promise keyed by `streamId:toolCallId`, and the
RPC layer settles it when the user approves or denies a tool.

**Human-in-the-loop** — A pause in automated work that waits for a person to decide before continuing.
*In this app:* an "ask" tool stops the turn and waits for the user to click allow or deny.

**Single-flight** — A guard that lets only one instance of some operation run at a time, so a second
start is blocked or coalesced while the first is in progress.
*In this app:* the chat-stream layer does not enforce single-flight per chat, so the window is expected
to prevent a second send while one is streaming.

**TSDoc** — A doc comment written as `/** ... */` right above a function or type. Editors read it and
show it on hover or autocomplete, and it can name each argument with `@param` and the result with
`@returns`. The syntax is verbose, so it earns its place only on the important, reused functions.
*In this app:* the public chat-stream entries (`startChatStream`, `retryChatStream`, `cancelStream`) and
the shared `launchTurn` carry TSDoc so a caller sees what they do without opening the file.

**Watchdog (idle timeout)** — A timer that regular activity has to keep resetting. If nothing resets it
before it runs out, it fires, on the assumption the work has stalled, and stops it.
*In this app:* `createIdleTimeout` arms a timer that every stream delta resets; if the model goes quiet
for `requestTimeoutMs` with no delta, the timer aborts the turn.

**Short-circuit evaluation** — How `&&` and `||` stop early. `a && b` skips `b` when `a` is already
falsy and hands back `a` itself, not `true`/`false`; `a || b` skips `b` when `a` is truthy. The value you
get back is one of the operands, which is why `cond && value` returns `false` (the condition) when the
condition is false.
*In this app:* the style guide warns against `const saved = cond && save()` for exactly that reason: the
false branch binds `false`, not `undefined`. See [../conventions/style.md](../conventions/style.md).

**Type coercion (coerce)** — Deliberately converting a value from one type to another. Here it usually
means turning an unknown caught value into a real `Error`.
*In this app:* `toError(value)` coerces anything caught in a `catch` into an `Error`, wrapping a
non-Error around its text.

**Strategy pattern** — A design where one behavior that varies by case is captured behind a shared
interface, with one implementation per case, and you dispatch to the right one at runtime. It pays off
when each case holds genuinely different, non-trivial logic. It is over-engineering when the cases are
nearly identical or the variation is a single line: an interface plus a registry plus a dispatch to hold
what a small `switch` on an existing field would express. Rule of thumb: reach for it on real divergence
(the rule-of-three signal), not on speculation.
*In this app:* considered for per-provider free-model detection and declined. The universal truth (price
is 0) covers every provider; only OpenRouter adds a `:free`-suffix fallback. One `isFreeModel` that
branches on `model.provider` inline carries that without the machinery; a strategy can come later if a
provider ever brings truly complex free-detection.

## Security

**Path traversal** — A trick where text like `../../` is slipped into a file path so a write or read
escapes the folder the app meant to stay in, reaching files it shouldn't. Prevented by constraining the
input, for example requiring a plain id with no slashes.

**Loopback (127.0.0.1)** — The network address that means "this same machine only." A server bound to it
can't be reached by other computers on the network.
