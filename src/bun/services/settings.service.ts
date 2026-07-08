import { eq } from 'drizzle-orm';
import {
  DEFAULT_SETTINGS,
  SettingsDTO,
  type UpdateSettingsInput,
} from '../../shared-contracts/schemas/settings.schema';
import { db } from '../db/client';
import { settings } from '../db/schema';

export function getSettings(): SettingsDTO {
  const row = db.select().from(settings).where(eq(settings.key, 'app')).get();
  if (!row) return DEFAULT_SETTINGS;
  // Stored rows can predate newer fields, so validate what's there as a partial
  // (dropping anything unknown) and merge it over the current defaults.
  const stored = SettingsDTO.partial().parse(row.value);
  return { ...DEFAULT_SETTINGS, ...stored };
}

export function updateSettings(patch: UpdateSettingsInput): void {
  const current = getSettings();
  const updated = { ...current, ...patch };
  db.insert(settings)
    .values({ key: 'app', value: updated as unknown as string })
    .onConflictDoUpdate({ target: settings.key, set: { value: updated as unknown as string } })
    .run();
}
