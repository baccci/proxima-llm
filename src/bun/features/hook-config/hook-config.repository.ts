import { z } from 'zod';
import {
  HOOK_CATALOG,
  HOOK_META,
  type HookConfigEntry,
  type HookDetailRow,
} from '../../../shared-contracts/lifecycle/hook-catalog';
import { readSettingsBlob, writeSettingsBlob } from '../../infra/db/settings-store';

// This module owns the hook_config slice of the shared settings table. Only the deviations from
// the catalog defaults are stored (a sparse Record<actionId, boolean>), so a new built-in appears
// with its catalog default and stored data can never drift from stage/tier/provenance.
const KEY = 'hook_config';

const OverrideMap = z.record(z.string(), z.boolean());
type OverrideMap = z.infer<typeof OverrideMap>;

function readOverrides(): OverrideMap {
  const raw = readSettingsBlob(KEY);
  return raw !== undefined ? OverrideMap.parse(raw) : {};
}

function effectiveEnabled(actionId: string, overrides: OverrideMap): boolean {
  const entry = HOOK_META.get(actionId);
  return overrides[actionId] ?? entry?.defaultEnabled ?? false;
}

// The full config the registry builds from: every catalog action with its effective enabled bit.
export function load(): HookConfigEntry[] {
  const overrides = readOverrides();
  return HOOK_CATALOG.map((h) => ({
    stage: h.stage,
    actionId: h.actionId,
    provenance: h.provenance,
    enabled: effectiveEnabled(h.actionId, overrides),
  }));
}

// Flip one hook. Core mechanics (userManageable === false) are not togglable and are ignored.
// An override equal to the default is dropped so the stored map stays sparse.
export function setEnabled(actionId: string, enabled: boolean): void {
  const entry = HOOK_META.get(actionId);
  if (!entry?.userManageable) {
    return;
  }
  const next = { ...readOverrides() };
  if (enabled === entry.defaultEnabled) {
    delete next[actionId];
  } else {
    next[actionId] = enabled;
  }
  writeSettingsBlob(KEY, next);
}

// The renderer's hook list: each manageable catalog entry joined with its effective enabled bit.
export function listDetailed(): HookDetailRow[] {
  const overrides = readOverrides();
  return HOOK_CATALOG.filter((h) => h.userManageable).map((h) => ({
    stage: h.stage,
    actionId: h.actionId,
    label: h.label,
    description: h.description,
    tier: h.tier,
    provenance: h.provenance,
    enabled: effectiveEnabled(h.actionId, overrides),
  }));
}
