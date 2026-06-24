import { eq } from 'drizzle-orm';
import type {
  SettingsDTO,
  UpdateSettingsInput,
} from '../../shared-contracts/schemas/settings.schema';
import { DEFAULT_SETTINGS } from '../../shared-contracts/schemas/settings.schema';
import { db } from '../db/client';
import { settings } from '../db/schema';

export function getSettings(): SettingsDTO {
  const row = db.select().from(settings).where(eq(settings.key, 'app')).get();
  if (!row) return DEFAULT_SETTINGS;
  return { ...DEFAULT_SETTINGS, ...(row.value as Partial<SettingsDTO>) };
}

export function updateSettings(patch: UpdateSettingsInput): void {
  const current = getSettings();
  const updated = { ...current, ...patch };
  db.insert(settings)
    .values({ key: 'app', value: updated as unknown as string })
    .onConflictDoUpdate({ target: settings.key, set: { value: updated as unknown as string } })
    .run();
}
