import {
  DEFAULT_SETTINGS,
  SettingsDTO,
  type UpdateSettingsInput,
} from '../../../shared-contracts/schemas/settings.schema';
import { readSettingsBlob, writeSettingsBlob } from '../../infra/db/settings-store';

// This module owns the 'app' slice of the shared settings table.
const APP_KEY = 'app';

export function getSettings(): SettingsDTO {
  const raw = readSettingsBlob(APP_KEY);
  if (raw === undefined) {
    return DEFAULT_SETTINGS;
  }
  // Stored rows can predate newer fields, so validate what's there as a partial
  // (dropping anything unknown) and merge it over the current defaults.
  const stored = SettingsDTO.partial().parse(raw);
  return { ...DEFAULT_SETTINGS, ...stored };
}

export function updateSettings(patch: UpdateSettingsInput): void {
  const current = getSettings();
  const updated = { ...current, ...patch };
  writeSettingsBlob(APP_KEY, updated);
}
