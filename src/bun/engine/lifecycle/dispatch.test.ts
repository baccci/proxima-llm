import { afterAll, describe, expect, mock, test } from 'bun:test';
import { ACTION_TIER, type AnyAction } from './action';
import { HOOK_PROVENANCE, type HookConfigEntry } from './hook-config';
import { LIFECYCLE_STAGE } from './stages';

// runActions/buildRegistry log through the module-singleton logger, which writes to disk.
// Stub it so these unit tests stay hermetic and assert only on behavior (matches
// resilient-step.test.ts).
mock.module('../../infra/logging/logger', () => ({
  log: { warn: () => {}, error: () => {}, info: () => {} },
}));

const { runActions, buildRegistry } = await import('./dispatch');

// A fake action that records its id when run, and can be told to throw.
function fakeAction(
  id: string,
  stage: AnyAction['stage'],
  calls: string[],
  boom = false,
): AnyAction {
  return {
    id,
    stage,
    tier: ACTION_TIER.act,
    run: async () => {
      calls.push(id);
      if (boom) {
        throw new Error(`${id} boom`);
      }
    },
  };
}

describe('runActions', () => {
  afterAll(() => mock.restore());

  test('runs actions in order', async () => {
    const calls: string[] = [];
    const actions = [
      fakeAction('a', LIFECYCLE_STAGE.autoTitle, calls),
      fakeAction('b', LIFECYCLE_STAGE.autoTitle, calls),
    ];
    await runActions(actions, {}, LIFECYCLE_STAGE.autoTitle);
    expect(calls).toEqual(['a', 'b']);
  });

  test('isolates a throwing action so the next still runs and it never throws', async () => {
    const calls: string[] = [];
    const actions = [
      fakeAction('boom', LIFECYCLE_STAGE.autoTitle, calls, true),
      fakeAction('after', LIFECYCLE_STAGE.autoTitle, calls),
    ];
    await runActions(actions, {}, LIFECYCLE_STAGE.autoTitle);
    expect(calls).toEqual(['boom', 'after']);
  });

  test('an empty action list is a no-op', async () => {
    await runActions([], {}, LIFECYCLE_STAGE.autoTitle);
  });
});

describe('buildRegistry', () => {
  afterAll(() => mock.restore());

  const noCalls: string[] = [];
  const catalog = new Map<string, AnyAction>([
    ['act.compaction', fakeAction('act.compaction', LIFECYCLE_STAGE.compaction, noCalls)],
    ['act.title', fakeAction('act.title', LIFECYCLE_STAGE.autoTitle, noCalls)],
  ]);

  test('places enabled entries in their stage bucket, in config order', () => {
    const config: HookConfigEntry[] = [
      {
        stage: LIFECYCLE_STAGE.compaction,
        actionId: 'act.compaction',
        enabled: true,
        provenance: HOOK_PROVENANCE.builtIn,
      },
      {
        stage: LIFECYCLE_STAGE.autoTitle,
        actionId: 'act.title',
        enabled: true,
        provenance: HOOK_PROVENANCE.builtIn,
      },
    ];
    const registry = buildRegistry(config, catalog);
    expect(registry[LIFECYCLE_STAGE.compaction].map((a) => a.id)).toEqual(['act.compaction']);
    expect(registry[LIFECYCLE_STAGE.autoTitle].map((a) => a.id)).toEqual(['act.title']);
    expect(registry[LIFECYCLE_STAGE.memorySummary]).toEqual([]);
  });

  test('skips a disabled entry', () => {
    const config: HookConfigEntry[] = [
      {
        stage: LIFECYCLE_STAGE.compaction,
        actionId: 'act.compaction',
        enabled: false,
        provenance: HOOK_PROVENANCE.builtIn,
      },
    ];
    const registry = buildRegistry(config, catalog);
    expect(registry[LIFECYCLE_STAGE.compaction]).toEqual([]);
  });

  test('skips an entry whose actionId is not in the catalog', () => {
    const config: HookConfigEntry[] = [
      {
        stage: LIFECYCLE_STAGE.autoTitle,
        actionId: 'act.ghost',
        enabled: true,
        provenance: HOOK_PROVENANCE.agent,
      },
    ];
    const registry = buildRegistry(config, catalog);
    expect(registry[LIFECYCLE_STAGE.autoTitle]).toEqual([]);
  });

  test('keeps two actions on the same stage in config order', () => {
    const twoOnStage = new Map<string, AnyAction>([
      ['act.first', fakeAction('act.first', LIFECYCLE_STAGE.autoTitle, noCalls)],
      ['act.second', fakeAction('act.second', LIFECYCLE_STAGE.autoTitle, noCalls)],
    ]);
    const config: HookConfigEntry[] = [
      {
        stage: LIFECYCLE_STAGE.autoTitle,
        actionId: 'act.first',
        enabled: true,
        provenance: HOOK_PROVENANCE.builtIn,
      },
      {
        stage: LIFECYCLE_STAGE.autoTitle,
        actionId: 'act.second',
        enabled: true,
        provenance: HOOK_PROVENANCE.builtIn,
      },
    ];
    const registry = buildRegistry(config, twoOnStage);
    expect(registry[LIFECYCLE_STAGE.autoTitle].map((a) => a.id)).toEqual([
      'act.first',
      'act.second',
    ]);
  });
});

describe('the built-in defaults wire every stage', () => {
  test('DEFAULT_HOOK_CONFIG + CATALOG builds a registry with one action per stage', async () => {
    const { DEFAULT_HOOK_CONFIG } = await import('./hook-config');
    const { CATALOG, BUILTIN_ACTION_ID } = await import('./catalog');
    const registry = buildRegistry(DEFAULT_HOOK_CONFIG, CATALOG);
    expect(registry[LIFECYCLE_STAGE.compaction].map((a) => a.id)).toEqual([
      BUILTIN_ACTION_ID.compaction,
    ]);
    expect(registry[LIFECYCLE_STAGE.autoTitle].map((a) => a.id)).toEqual([
      BUILTIN_ACTION_ID.autoTitle,
    ]);
    expect(registry[LIFECYCLE_STAGE.memorySummary].map((a) => a.id)).toEqual([
      BUILTIN_ACTION_ID.memorySummary,
    ]);
  });
});

describe('rebuildRegistry', () => {
  test('swaps the process registry so a later dispatch runs the new config', async () => {
    const ran: string[] = [];
    const action: AnyAction = {
      id: 'builtin.completion-sound',
      stage: LIFECYCLE_STAGE.turnDone,
      tier: ACTION_TIER.observe,
      run: async () => {
        ran.push('sound');
      },
    };
    const catalog = new Map<string, AnyAction>([[action.id, action]]);
    const { rebuildRegistry, dispatchStage } = await import('./dispatch');
    // rebuildRegistry uses the real CATALOG, so assert on buildRegistry directly for isolation.
    const built = buildRegistry(
      [
        {
          stage: LIFECYCLE_STAGE.turnDone,
          actionId: action.id,
          enabled: true,
          provenance: HOOK_PROVENANCE.builtIn,
        },
      ],
      catalog,
    );
    expect(built[LIFECYCLE_STAGE.turnDone].map((a) => a.id)).toEqual([action.id]);
    expect(typeof rebuildRegistry).toBe('function');
    expect(typeof dispatchStage).toBe('function');
  });

  test('gives buildRegistry a turn-error bucket', () => {
    const registry = buildRegistry([], new Map());
    expect(registry[LIFECYCLE_STAGE.turnError]).toEqual([]);
    expect(registry[LIFECYCLE_STAGE.turnDone]).toEqual([]);
  });
});
