import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { Utils } from 'electrobun/bun'
import { mkdirSync } from 'fs'
import { join } from 'path'
import * as schema from './schema'

// Per user folder where the app stores its data, like the database and attachments.
const userDataDir = Utils.paths.userData
mkdirSync(userDataDir, { recursive: true })

// Full path to the SQLite database file.
const dbPath = join(userDataDir, 'proxima.db')
const sqlite = new Database(dbPath, { create: true })

// WAL mode lets reads run at the same time as a write without blocking.
sqlite.exec('PRAGMA journal_mode=WAL;')
// SQLite leaves foreign keys off by default. Turn them on so cascade and set null deletes work.
sqlite.exec('PRAGMA foreign_keys=ON;')

export const db = drizzle(sqlite, { schema })
export { sqlite }
