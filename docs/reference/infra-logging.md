# Infra: logging (`src/bun/infra/logging/logger.ts`)

The app's one log sink: a JSON-lines file logger with daily rollover and retention, plus the funnel that
renderer errors reach over RPC.

## What this is, in plain language

When something goes wrong (or is worth recording), it gets written to a **log file on disk** so it can be
inspected later from the Diagnostics screen. This file is the only place the app writes logs. It is a
**singleton** (`log`) with level methods, and it is deliberately boring and bulletproof: logging must
never itself crash the app.

Logs are **JSON lines** (one JSON object per line) at `userLogs/proxima-<date>.log`. Each line carries a
timestamp, level, source, message, and optionally a stack or a context object. JSON-per-line is chosen so
the Diagnostics UI (and any tool) can parse entries without a log-format parser.

## The `log` singleton

| Member | For |
|---|---|
| `log.error / warn / info(msg, errOrCtx?)` | main-process logging at a level |
| `log.rendererError(msg, stack?, context?)` | errors forwarded from the renderer over RPC |
| `log.init()` | call once at boot: set today's date, run retention cleanup |
| `log.installGlobalHandlers()` | catch `uncaughtException` / `unhandledRejection` as error logs |
| `log.dir() / log.currentFile()` | introspection for the Diagnostics UI |

`errOrCtx` is handled by type: an `Error` becomes `msg: "<msg>: <error.message>"` plus a `stack`; any other
value is attached as a `context` object. So callers can pass either an error or arbitrary structured
context and get sensible output.

## Two processes, one sink

The renderer runs in a **separate process** and **cannot import this module** (it is bun-only). Renderer
errors reach the file the long way: the renderer calls the `logClientError` RPC, `logs.service` handles it,
and it lands here through `log.rendererError`. That is why every line carries a `source` field
(`main` | `renderer`): one file holds both, tagged by origin.

## Rollover and retention

- **Daily file.** The filename embeds the date (`proxima-YYYY-MM-DD.log`), so each calendar day gets its
  own file with no explicit rotation step.
- **Retention.** `cleanup()` deletes any `.log` older than `LOG_RETENTION_DAYS` (14) by mtime.
- **When cleanup runs.** Once at `init()`, and then at most once per calendar day: `maybeRollover()`
  compares today's date string to a module-level `lastDateStr` on each write and runs `cleanup()` when the
  day flips. So a long-running app still rolls its retention forward at midnight, on the first log after.

## Never throws

Every filesystem call here is wrapped so a logging failure cannot take down the app:

- `appendLine` swallows write errors (a `try/catch` with an empty catch, the one place a bare empty catch
  is correct).
- `cleanup` swallows both the `readdir` error and each per-file `stat` / `unlink` error, so one bad file
  does not stop the sweep.

This is the deliberate inversion of the usual "do not swallow errors" rule: a logger that throws would turn
a minor disk hiccup into a crash.

## Concerns / footguns

- **Swallowed errors are silent.** By design the logger never throws, so a broken or unwritable log dir
  produces **no logs and no warning**. If diagnostics ever look empty, suspect the sink itself.
- **Rollover depends on the process living across midnight.** `lastDateStr` is module state; the daily
  cleanup only fires while the app is running. A machine that is always asleep at midnight still cleans up
  on the next `init()`, so this is fine in practice, just worth knowing.
- **Retention is by file mtime, not by the date in the name.** Editing or touching an old log would keep it
  alive past 14 days. Not a real scenario, but that is the actual rule.

## Named constants / vocabulary

- `LOG_RETENTION_DAYS = 14` — how long log files are kept.
- `MS_PER_DAY` — the retention-cutoff unit.
- `LOG_DIR = Utils.paths.userLogs` — the log directory.
- `source: 'main' | 'renderer'` — which process a line came from.

## Tests

None. The branching bits (`maybeRollover`'s day-flip, `cleanup`'s cutoff) are time- and filesystem-bound;
`todayStr` is a one-liner over `Date`. Extracting a pure "is this file expired given now?" predicate would
be testable but low value against a small, stable file.

## Links

- `features/logs/logs.service.ts` — reads `dir()` / `currentFile()` for the Diagnostics UI and forwards
  renderer errors here through `log.rendererError` (the `logClientError` RPC).
- [infra-keychain.md](infra-keychain.md) — `log.error` is the keychain's failure sink.
- [../architecture.md](../architecture.md) — the two-process model behind the `source` tag.
