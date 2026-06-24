import { sqlite } from './client';

export function setupSchema() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS models (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      family TEXT NOT NULL,
      display_name TEXT NOT NULL,
      capabilities TEXT NOT NULL,
      pricing TEXT,
      is_custom INTEGER NOT NULL DEFAULT 0,
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

    CREATE INDEX IF NOT EXISTS idx_chats_project ON chats(project_id, last_message_at DESC);
    CREATE INDEX IF NOT EXISTS idx_chats_pinned  ON chats(pinned, last_message_at DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, created_at);
  `);

  // Add pricing column if it doesn't exist (existing DBs)
  const pricingCols: { name: string }[] = sqlite.query(`PRAGMA table_info(models)`).all() as {
    name: string;
  }[];
  const hasPricing = pricingCols.some((c) => c.name === 'pricing');
  if (!hasPricing) {
    sqlite.exec(`ALTER TABLE models ADD COLUMN pricing TEXT`);
  }

  // Add source column if it doesn't exist (existing DBs)
  const cols: { name: string }[] = sqlite.query(`PRAGMA table_info(models)`).all() as {
    name: string;
  }[];
  const hasSource = cols.some((c) => c.name === 'source');
  if (!hasSource) {
    sqlite.exec(`ALTER TABLE models ADD COLUMN source TEXT NOT NULL DEFAULT 'builtin'`);
    // Backfill: tag existing OpenRouter rows and custom rows correctly
    sqlite.exec(`UPDATE models SET source = 'openrouter' WHERE provider = 'openrouter'`);
    sqlite.exec(`UPDATE models SET source = 'custom' WHERE is_custom = 1`);
  }

  // Add composer column if it doesn't exist (existing DBs)
  const chatCols: { name: string }[] = sqlite.query(`PRAGMA table_info(chats)`).all() as {
    name: string;
  }[];
  const hasComposer = chatCols.some((c) => c.name === 'composer');
  if (!hasComposer) {
    sqlite.exec(`ALTER TABLE chats ADD COLUMN composer TEXT NOT NULL DEFAULT '{}'`);
  }

  // Add stop_reason column if it doesn't exist (existing DBs)
  const msgCols: { name: string }[] = sqlite.query(`PRAGMA table_info(messages)`).all() as {
    name: string;
  }[];
  const hasStopReason = msgCols.some((c) => c.name === 'stop_reason');
  if (!hasStopReason) {
    sqlite.exec(`ALTER TABLE messages ADD COLUMN stop_reason TEXT`);
  }
}
