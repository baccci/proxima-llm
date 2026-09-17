import { PartKind } from '@shared/schemas/message.schema'
import { sqlite } from './client'

// Add a column only if the table lacks it: SQLite has no idempotent ADD COLUMN.
// Returns whether it was just added, so callers can run one-time backfills.
function addColumnIfMissing(table: string, column: string, type: string): boolean {
  const cols = sqlite.query(`PRAGMA table_info(${table})`).all() as { name: string }[]
  if (cols.some((c) => c.name === column)) {
    return false
  }
  sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`)
  return true
}

// Drop a column only if the table still has it. Mirror of addColumnIfMissing for retired
// columns. Modern SQLite (Bun's) supports DROP COLUMN directly when no index depends on it.
function dropColumnIfPresent(table: string, column: string): void {
  const cols = sqlite.query(`PRAGMA table_info(${table})`).all() as { name: string }[]
  if (!cols.some((c) => c.name === column)) {
    return
  }
  sqlite.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`)
}

// Create a table only if it is absent, reporting whether this call is the one that made
// it. Callers use that to run a one-time backfill on the boot that introduces the table.
function createTableIfMissing(name: string, ddl: string): boolean {
  const existing = sqlite
    .query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .all(name) as { name: string }[]
  if (existing.length > 0) {
    return false
  }

  sqlite.exec(ddl)
  return true
}

// The FTS5 full-text index behind chat search. Two tables, because a title hit has no
// message to land on while a content hit does. The index is derived data: it can be
// dropped and rebuilt from chats and messages at any time.
//
// Triggers keep it in sync rather than application code, so a write that bypasses the app
// layer still leaves the index correct. Only text parts are indexed: reasoning is the
// model's scratch work and would drown real hits, and tool call payloads are structure,
// not prose. The tokenizer folds accents, so "cafe" finds "café".
function setupSearchIndex(): void {
  const chatsIndexCreated = createTableIfMissing(
    'chats_fts',
    `CREATE VIRTUAL TABLE chats_fts USING fts5(
       title,
       chat_id UNINDEXED,
       tokenize = 'unicode61 remove_diacritics 2'
     )`,
  )

  const messagesIndexCreated = createTableIfMissing(
    'messages_fts',
    `CREATE VIRTUAL TABLE messages_fts USING fts5(
       body,
       message_id UNINDEXED,
       chat_id UNINDEXED,
       tokenize = 'unicode61 remove_diacritics 2'
     )`,
  )

  // Concatenated text of one message's parts, for use inside a trigger or a backfill.
  // Yields NULL when the message carries no text part at all (a bare tool call), which
  // the callers filter out so the index holds no empty rows.
  const textPartsOf = (partsExpr: string) => `
    SELECT group_concat(json_extract(value, '$.text'), ' ') AS body
    FROM json_each(${partsExpr})
    WHERE json_extract(value, '$.type') = '${PartKind.enum.text}'
  `

  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS chats_fts_insert AFTER INSERT ON chats BEGIN
      INSERT INTO chats_fts(title, chat_id) VALUES (NEW.title, NEW.id);
    END;

    CREATE TRIGGER IF NOT EXISTS chats_fts_update AFTER UPDATE OF title ON chats BEGIN
      DELETE FROM chats_fts WHERE chat_id = OLD.id;
      INSERT INTO chats_fts(title, chat_id) VALUES (NEW.title, NEW.id);
    END;

    CREATE TRIGGER IF NOT EXISTS chats_fts_delete AFTER DELETE ON chats BEGIN
      DELETE FROM chats_fts WHERE chat_id = OLD.id;
    END;

    CREATE TRIGGER IF NOT EXISTS messages_fts_insert AFTER INSERT ON messages BEGIN
      INSERT INTO messages_fts(body, message_id, chat_id)
      SELECT body, NEW.id, NEW.chat_id
      FROM (${textPartsOf('NEW.parts')} )
      WHERE body IS NOT NULL AND body <> '';
    END;

    CREATE TRIGGER IF NOT EXISTS messages_fts_update AFTER UPDATE OF parts ON messages BEGIN
      DELETE FROM messages_fts WHERE message_id = OLD.id;
      INSERT INTO messages_fts(body, message_id, chat_id)
      SELECT body, NEW.id, NEW.chat_id
      FROM (${textPartsOf('NEW.parts')} )
      WHERE body IS NOT NULL AND body <> '';
    END;

    CREATE TRIGGER IF NOT EXISTS messages_fts_delete AFTER DELETE ON messages BEGIN
      DELETE FROM messages_fts WHERE message_id = OLD.id;
    END;
  `)

  // Backfill databases that predate the index. Only on the boot that created the table,
  // so later boots skip the scan entirely.
  if (chatsIndexCreated) {
    sqlite.exec(`INSERT INTO chats_fts(title, chat_id) SELECT title, id FROM chats`)
  }

  if (messagesIndexCreated) {
    sqlite.exec(`
      INSERT INTO messages_fts(body, message_id, chat_id)
      SELECT body, id, chat_id FROM (
        SELECT m.id AS id, m.chat_id AS chat_id, (${textPartsOf('m.parts')}) AS body
        FROM messages m
      )
      WHERE body IS NOT NULL AND body <> ''
    `)
  }
}

export function setupSchema() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS models (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      family TEXT NOT NULL,
      display_name TEXT NOT NULL,
      capabilities TEXT NOT NULL,
      pricing TEXT,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      source TEXT NOT NULL DEFAULT 'builtin',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      system_prompt TEXT,
      memory TEXT,
      default_model_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      pinned INTEGER NOT NULL DEFAULT 0,
      model_id TEXT,
      composer TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_message_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user','assistant','system')),
      model_id TEXT,
      parts TEXT NOT NULL,
      usage TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK(kind IN ('image','file')),
      media_type TEXT NOT NULL,
      byte_size INTEGER NOT NULL,
      sha256 TEXT NOT NULL,
      rel_path TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memory_slices (
      id          TEXT PRIMARY KEY,
      scope       TEXT NOT NULL CHECK(scope IN ('global','project')),
      project_id  TEXT REFERENCES projects(id) ON DELETE CASCADE,
      title       TEXT NOT NULL,
      content     TEXT NOT NULL,
      source      TEXT NOT NULL CHECK(source IN ('user','model')) DEFAULT 'user',
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS project_files (
      id          TEXT PRIMARY KEY,
      project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      media_type  TEXT NOT NULL,
      byte_size   INTEGER NOT NULL,
      sha256      TEXT NOT NULL,
      rel_path    TEXT NOT NULL,
      created_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS compaction_snapshots (
      id                         TEXT PRIMARY KEY,
      chat_id                    TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      created_at                 INTEGER NOT NULL,
      covered_through_at         INTEGER NOT NULL,
      covered_through_message_id TEXT NOT NULL,
      display_through_at         INTEGER,
      summary_text               TEXT NOT NULL,
      tokens_saved               INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_chats_project      ON chats(project_id, last_message_at DESC);
    CREATE INDEX IF NOT EXISTS idx_chats_pinned       ON chats(pinned, last_message_at DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_chat      ON messages(chat_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_memory_scope       ON memory_slices(scope, project_id);
    CREATE INDEX IF NOT EXISTS idx_compaction_chat    ON compaction_snapshots(chat_id, created_at DESC);
  `)

  // Back-add columns onto DBs created before each was introduced.
  addColumnIfMissing('models', 'pricing', 'TEXT')

  if (addColumnIfMissing('models', 'source', "TEXT NOT NULL DEFAULT 'builtin'")) {
    // Backfill: tag existing OpenRouter rows correctly.
    sqlite.exec(`UPDATE models SET source = 'openrouter' WHERE provider = 'openrouter'`)
  }

  addColumnIfMissing('chats', 'composer', "TEXT NOT NULL DEFAULT '{}'")
  addColumnIfMissing('compaction_snapshots', 'display_through_at', 'INTEGER')
  addColumnIfMissing('messages', 'stop_reason', 'TEXT')
  addColumnIfMissing('projects', 'memory_summary', 'TEXT')
  addColumnIfMissing('projects', 'icon', 'TEXT')
  addColumnIfMissing('projects', 'palette', 'TEXT')
  addColumnIfMissing('projects', 'icon_color', 'TEXT')

  // Retired: the custom-model feature is gone and ModelSource replaced source='custom',
  // but the boolean outlived both. Nothing branches on it.
  dropColumnIfPresent('models', 'is_custom')

  // One-time migration: the old hardcoded Anthropic seed wrote source='builtin'. Anthropic
  // is now a synced source, so adopt those rows into it, preserving each row's isEnabled.
  // Idempotent (after the first run no builtin rows remain), so a cheap no-op on later
  // boots. The seed only ever wrote Anthropic-provider rows, so no provider filter is needed.
  sqlite.exec(`UPDATE models SET source = 'anthropic' WHERE source = 'builtin'`)

  // Runs last: the triggers and the backfill both read chats and messages, so every
  // table and back-added column above is already in place by the time it runs.
  setupSearchIndex()
}
