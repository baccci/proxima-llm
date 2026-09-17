# Infra: the database (`src/bun/infra/db/`)

The storage floor the whole app sits on: how the SQLite database is opened, how its schema is defined and
migrated, the shared key-value substrate, and how built-in models are seeded.

## What this layer is, in plain language

Everything the app remembers (chats, messages, projects, models, memory, settings) lives in **one SQLite
file** on the user's disk. This folder is the plumbing around that file: it opens the database, defines the
tables, keeps the schema up to date across app versions, and seeds the models the app ships. It is the
bottom of the stack: repositories in `features/` import `db` from here and run queries; nothing here
imports back up.

## Opening the database (`client.ts`)

`client.ts` is a **module singleton**: importing it opens the database as a side effect, and every other
module shares that one connection. On import it:

1. `mkdir -p` the user-data dir (`Utils.paths.userData`), then opens `userData/proxima.db` with
   `{ create: true }`.
2. Sets two pragmas that matter:
   - `PRAGMA journal_mode=WAL` — write-ahead logging, so a read does not block on a concurrent write.
   - `PRAGMA foreign_keys=ON` — SQLite ships foreign keys **off**; without this the `ON DELETE CASCADE` /
     `SET NULL` rules in the schema silently do nothing.
3. Exports `db` (the drizzle wrapper, for typed queries) and the raw `sqlite` handle (for the migration
   code, which runs raw DDL drizzle does not model).

The singleton-on-import is why importing anything that reaches `db` drags the whole Electrobun `userData()`
path. It is the reason pure logic must live in leaves that never touch this: a `*.test.ts` importing a
repository pays a slow startup and an `ENOENT ../Resources/version.json` unless the pure bit was extracted
first.

## Two definitions of the schema (the thing to understand)

The schema is written **twice**, on purpose, and they must be kept in sync by hand:

| Where | Form | Used for |
|---|---|---|
| [`schema.ts`](../../src/bun/infra/db/schema.ts) | drizzle `sqliteTable(...)` defs | **typed queries**: `db.select().from(models)` and the column types |
| [`migrate.ts`](../../src/bun/infra/db/migrate.ts) | raw `CREATE TABLE` SQL in `setupSchema()` | **the actual DDL** that builds the file on disk |

drizzle *can* generate migrations from `schema.ts`, but this app does not use that; it hand-rolls the DDL
in `migrate.ts`. So `schema.ts` is drizzle's typed **view** of the tables, and `migrate.ts` is what
actually **creates** them. Add a column in one and forget the other and you get a mismatch: a column the
queries expect but the DB lacks (a runtime error), or a column on disk drizzle cannot see. **When you
change the schema, change both files.** This duplication is the main footgun of the db layer; it is the
price of hand-rolled migrations (see below for why they are hand-rolled).

Columns that hold JSON are typed with drizzle's `$type<>()` (for example
`capabilities: text(..., { mode: 'json' }).$type<ModelCapabilities>()`), so the shape is enforced in
TypeScript even though SQLite stores text. The `source` column reaches its enum through the schema accessor
(`ModelSource.options` / `ModelSource.enum.builtin`).

## Migrations (`migrate.ts`)

`setupSchema()` runs on every boot and is **idempotent**: `CREATE TABLE IF NOT EXISTS` for all nine tables
plus the indexes, then a list of hand-rolled column migrations, and finally the full-text search index
(its own section below). There is **no version table and no migration files**. Instead each change is
expressed as an idempotent step:

- `addColumnIfMissing(table, column, type)` — reads `PRAGMA table_info`, adds the column only if absent
  (SQLite has no `ADD COLUMN IF NOT EXISTS`). Returns whether it just added it, so a caller can run a
  **one-time backfill** right after (for example adding `source` then
  `UPDATE models SET source = 'openrouter' WHERE provider = 'openrouter'`).
- `dropColumnIfPresent(table, column)` — the mirror, for retired columns (for example the dead `is_custom`
  boolean that outlived the custom-model feature).
- `createTableIfMissing(name, ddl)` — creates a table only if `sqlite_master` lacks it, and **returns
  whether this call is the one that made it**. That return is what lets the search index below run its
  backfill exactly once, on the boot that introduces the table.

**Why hand-rolled instead of drizzle-kit migrations?** For a single-file local desktop DB with one writer,
a versioned migration toolchain is overkill; an idempotent `setupSchema()` that any older DB can run to
catch up is simpler to reason about and has no migration-state to corrupt. The tradeoff is the
two-definitions sync burden above, and that migrations are append-only prose you read top-to-bottom rather
than discrete files.

## The full-text search index (`setupSearchIndex()` in `migrate.ts`)

Chat search is backed by **SQLite's FTS5** full-text extension, built by `setupSearchIndex()` at the very
end of `setupSchema()` (it reads `chats` and `messages`, so every table and back-added column above must
already exist). SQLite ships FTS5 in the `bun:sqlite` build, so there is no dependency to add.

Two virtual tables, because the two kinds of hit need different things:

| Table | Indexed | Carried unindexed | Why |
|---|---|---|---|
| `chats_fts` | `title` | `chat_id` | a title hit has no message to land on |
| `messages_fts` | `body` | `message_id`, `chat_id` | a content hit points at the message to scroll to |

Both tokenize with `unicode61 remove_diacritics 2`, so `cafe` finds `café`.

**Only `text` parts are indexed.** `reasoning` is the model's scratch work and would drown real hits, and
tool call payloads are structure, not prose. The extraction runs in pure SQL, pulling `$.text` out of the
`parts` JSON with `json_each`, so it works inside a trigger with no application code involved.

**Content is stored in the index, not `content=''`.** The external-content form would save the disk space,
but `snippet()` needs the text to build an excerpt. Duplicating message text on disk is the price of
showing the user why a result matched.

**Six triggers keep it in sync**, insert / update / delete on each of `chats` and `messages`. Triggers
rather than repository code, so a write that bypasses the app layer (a future sync process) still leaves
the index correct. Foreign-key cascade deletes *do* fire the child table's triggers, so deleting a chat
removes its messages and their index rows with no manual cleanup in `deleteChat`.

**The index is derived data.** It can be dropped and rebuilt from `chats` and `messages` at any time,
which is why a one-time backfill (guarded by `createTableIfMissing`'s return) is enough to bring a
database that predates the feature up to date. It also means the index is not something to sync or
migrate: a future cloud database would replicate rows and rebuild its own index.

The queries that read these tables live in `chat.repository.ts` (`searchChats`), not here.

## The settings KV substrate (`settings-store.ts`)

A single `settings` table (`key TEXT PRIMARY KEY, value TEXT`) backs several unrelated subsystems.
`settings-store.ts` is the thin accessor:

- `readSettingsBlob(key): unknown` — returns the stored blob, or `undefined` if never written.
- `writeSettingsBlob(key, value)` — upsert (`onConflictDoUpdate`).

The value type is **`unknown` by design**: this module moves opaque JSON in and out and does **not** know
any key's shape. Each caller owns the schema for its own key and validates on read. This is the shared-KV
substrate: a shared KV table with no single owner aggregate; instead each module owns just its key.
`tool-permission` owns `tool_policies`, `settings.repository` owns the app-settings blob, the model sync
marker owns its timestamp key. The parse-on-read discipline lives in each of those, not here.

## Seeding built-in models (`seed.ts`, `model-seed.ts`, `model-source.ts`)

- `model-seed.ts` — `MODEL_SEED`, the hard-coded Claude models the app ships (id, family, display name,
  capabilities). The source of truth for what is available out of the box.
- `model-source.ts` — the `ModelSource` enum (`builtin` | `openrouter`): how a model row entered the DB and
  **which subsystem may overwrite it**.
- `seed.ts` — `seedModels()` runs each boot: insert any `MODEL_SEED` row that is missing (tagged
  `source: builtin`), **refresh** the specs of existing `builtin` rows, and **leave user- and
  openrouter-sourced rows untouched**.

That last rule is the seed half of the **source-ownership** model documented in [model.md](model.md): a
source only ever rewrites its own rows, and `isEnabled` is always the user's to set (seed refreshes
`capabilities` / `displayName`, never `isEnabled`). The sync half (the OpenRouter catalog) is the mirror on
the `openrouter` source.

## Concerns / footguns

- **The schema lives in two files (`schema.ts` and `migrate.ts`) and they must agree.** The single most
  likely db bug: change one, forget the other. Covered above.
- **The FTS tables are the deliberate exception to that rule.** `chats_fts` and `messages_fts` exist only
  in `migrate.ts`. drizzle has no way to model an FTS5 virtual table, so they are absent from `schema.ts`
  on purpose and `searchChats` reaches them through the raw `sqlite` handle instead of `db`. Do not
  "fix" the asymmetry by adding them to `schema.ts`.
- **Migrations are idempotent prose, not versioned.** Safe to re-run, but there is no rollback and no
  record of "which migrations ran" beyond the current column set. Reading `setupSchema()` top-to-bottom is
  the migration history.
- **`foreign_keys=ON` is load-bearing.** Every `ON DELETE CASCADE` / `SET NULL` in the schema depends on
  that pragma being set on the connection. It is set once in `client.ts`; do not open a second connection
  without it.
- **Opening is a side effect of import.** Importing `client.ts` (directly or transitively) opens the DB and
  touches the filesystem. This is why tests of pure logic must avoid the import chain entirely.

## Named constants / vocabulary

- `dbPath = userData/proxima.db` — the one database file.
- `MODEL_SEED` — the built-in models shipped in code.
- `ModelSource` — `builtin` | `openrouter`, the row-ownership tag.
- `chats_fts` / `messages_fts` — the two FTS5 virtual tables behind chat search, derived data rebuildable
  from `chats` and `messages`.
- The `settings` KV keys are owned by their modules (`tool_policies`, app-settings, the sync marker), not
  named here.

## Tests

Almost none, and little here is unit-testable in isolation: everything touches the live SQLite file or is
DDL. The exception is the search index, which `chat.repository.test.ts` exercises for real: it points
`client.ts` at an in-memory database, runs `setupSchema()`, and lets the triggers index the rows it seeds,
so the `searchChats` tests cover the DDL and the triggers as a side effect rather than a hand-populated
index.
`addColumnIfMissing` / `dropColumnIfPresent` are the only branching logic, but they read `PRAGMA table_info`
off the real connection, so they are integration surface, not pure units. The seed's source-ownership
decision (`existing.source !== builtin` skips) is the one bit of pure branching worth a test, but it is
woven into the DB loop in `seedModels`.

## Links

- [model.md](model.md) — the source-ownership model in full (seed here is its `builtin` half; sync is the
  `openrouter` half).
- [infra-keychain.md](infra-keychain.md), [infra-llm.md](infra-llm.md), [infra-logging.md](infra-logging.md)
  — the other three infra concerns.
- [../architecture.md](../architecture.md) — process model, IPC, the DB in the overall stack.
