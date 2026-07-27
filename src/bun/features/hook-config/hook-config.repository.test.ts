import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { HOOK_ACTION_ID } from '../../../shared-contracts/lifecycle/hook-catalog';

let store: Record<string, unknown> = {};
mock.module('../../infra/db/settings-store', () => ({
  readSettingsBlob: (key: string) => store[key],
  writeSettingsBlob: (key: string, value: unknown) => {
    store[key] = value;
  },
}));

const repo = await import('./hook-config.repository');

beforeEach(() => {
  store = {};
});

describe('hook-config repository', () => {
  it('load() returns catalog defaults when nothing is stored', () => {
    const cfg = repo.load();
    const sound = cfg.find((c) => c.actionId === HOOK_ACTION_ID.completionSound);
    const compaction = cfg.find((c) => c.actionId === HOOK_ACTION_ID.compaction);
    expect(sound?.enabled).toBe(false);
    expect(compaction?.enabled).toBe(true);
  });

  it('setEnabled() overlays a manageable hook and load() reflects it', () => {
    repo.setEnabled(HOOK_ACTION_ID.completionSound, true);
    const cfg = repo.load();
    expect(cfg.find((c) => c.actionId === HOOK_ACTION_ID.completionSound)?.enabled).toBe(true);
  });

  it('setEnabled() drops the override when it equals the default (stays sparse)', () => {
    repo.setEnabled(HOOK_ACTION_ID.completionSound, true);
    repo.setEnabled(HOOK_ACTION_ID.completionSound, false);
    expect(store.hook_config).toEqual({});
  });

  it('setEnabled() ignores a non-manageable core mechanic', () => {
    repo.setEnabled(HOOK_ACTION_ID.compaction, false);
    expect(repo.load().find((c) => c.actionId === HOOK_ACTION_ID.compaction)?.enabled).toBe(true);
    expect(store.hook_config ?? {}).toEqual({});
  });

  it('listDetailed() returns only the manageable hooks with effective enabled', () => {
    repo.setEnabled(HOOK_ACTION_ID.completionNotification, true);
    const rows = repo.listDetailed();
    expect(rows.map((r) => r.actionId)).toEqual([
      HOOK_ACTION_ID.completionSound,
      HOOK_ACTION_ID.completionNotification,
      HOOK_ACTION_ID.errorSound,
      HOOK_ACTION_ID.approvalSound,
    ]);
    expect(rows.find((r) => r.actionId === HOOK_ACTION_ID.completionNotification)?.enabled).toBe(
      true,
    );
  });
});
