import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Utils } from 'electrobun/bun';
import { mkdirSync } from 'fs';
import { join } from 'path';
import * as schema from './schema';

const userDataDir = Utils.paths.userData;
mkdirSync(userDataDir, { recursive: true });

const dbPath = join(userDataDir, 'llm-chat.db');
const sqlite = new Database(dbPath, { create: true });

sqlite.exec('PRAGMA journal_mode=WAL;');
sqlite.exec('PRAGMA foreign_keys=ON;');

export const db = drizzle(sqlite, { schema });
export { sqlite };
