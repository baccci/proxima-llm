import { Utils } from 'electrobun/bun';
import { copyFileSync, cpSync, existsSync, mkdirSync } from 'fs';
import { join, sep } from 'path';
import { PROVIDER_IDS } from '../shared-contracts/providers/registry';
import { migrateApiKeysFrom } from './secrets/keychain';

const OLD_IDENTIFIER = 'sh.llmchat.app';
const NEW_IDENTIFIER = 'sh.proxima.app';
const OLD_DB_NAME = 'llm-chat.db';
const NEW_DB_NAME = 'proxima.db';
const OLD_KEYCHAIN_SERVICE = 'com.llmchat.apikeys';

// Derive the old userData dir from the new one by swapping just the bundle-identifier
// path segment. This preserves the electrobun channel subdir (e.g. `/dev`) that
// `Utils.paths.userData` appends — hardcoding the parent would miss `.../sh.proxima.app/dev`.
function oldUserDataDir(newDir: string): string | null {
  const parts = newDir.split(sep);
  const idx = parts.lastIndexOf(NEW_IDENTIFIER);
  if (idx === -1) return null;
  parts[idx] = OLD_IDENTIFIER;
  return parts.join(sep);
}

export function runMigration(): void {
  const newDataDir = Utils.paths.userData;
  const newDbPath = join(newDataDir, NEW_DB_NAME);

  // Guard: once the new DB exists we've already migrated (or the user has new data) — never clobber.
  if (!existsSync(newDbPath)) {
    const oldDir = oldUserDataDir(newDataDir);
    const oldDbPath = oldDir ? join(oldDir, OLD_DB_NAME) : null;

    if (oldDir && oldDbPath && existsSync(oldDbPath)) {
      mkdirSync(newDataDir, { recursive: true });
      copyFileSync(oldDbPath, newDbPath);
      for (const suffix of ['-wal', '-shm'] as const) {
        const sidecar = `${oldDbPath}${suffix}`;
        if (existsSync(sidecar)) copyFileSync(sidecar, `${newDbPath}${suffix}`);
      }
      // Carry attachments (images/files referenced by restored chats) if not already present.
      const oldAttachments = join(oldDir, 'attachments');
      const newAttachments = join(newDataDir, 'attachments');
      if (existsSync(oldAttachments) && !existsSync(newAttachments)) {
        cpSync(oldAttachments, newAttachments, { recursive: true });
      }
    }
  }

  migrateApiKeysFrom(OLD_KEYCHAIN_SERVICE, PROVIDER_IDS);
}
