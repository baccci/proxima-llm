import { eq } from 'drizzle-orm'
import { db } from './client'
import { settings } from './schema'

// The settings table is a key -> JSON-blob store shared by several subsystems.
// This module moves opaque blobs in and out; it does not know their shape, so the
// value is unknown by design. Each caller owns the schema for its key and validates
// the result of readSettingsBlob before using it.

// Returns the stored blob for a key, or undefined when the key was never written.
export function readSettingsBlob(key: string): unknown {
  const row = db.select().from(settings).where(eq(settings.key, key)).get()
  return row?.value
}

// Upsert a blob under a key: insert it, or overwrite the existing row.
export function writeSettingsBlob(key: string, value: unknown): void {
  db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run()
}
