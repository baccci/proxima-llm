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
}
