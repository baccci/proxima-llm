import { afterAll, describe, expect, mock, test } from 'bun:test';
import { LIFECYCLE_STAGE } from './stages';

// The helper logs failures through the module-singleton logger, which writes to
// disk. Stub it so these unit tests stay hermetic and assert only on behavior.
mock.module('../../infra/logging/logger', () => ({
  log: { warn: () => {}, error: () => {}, info: () => {} },
}));

const { runResilientStep } = await import('./resilient-step');

// A scripted run() spy. script[modelId] === 'ok' succeeds with a marker string;
// any other value is thrown, so a test states exactly how each model behaves and
// can assert the exact sequence of models the helper tried.
function scriptedRun(script: Record<string, unknown>) {
  const calls: string[] = [];
  const run = async (modelId: string): Promise<string> => {
    calls.push(modelId);
    const outcome = script[modelId];
    if (outcome === 'ok') {
      return `summary-by-${modelId}`;
    }
    throw outcome;
  };
  return { run, calls };
}

describe('runResilientStep', () => {
  afterAll(() => {
    mock.restore();
  });

  test('returns the primary result when the primary model succeeds', async () => {
    const { run, calls } = scriptedRun({ cheap: 'ok' });
    const result = await runResilientStep({
      stage: LIFECYCLE_STAGE.autoTitle,
      primaryModelId: 'cheap',
      fallbackModelId: 'chat',
      run,
    });
    expect(result).toBe('summary-by-cheap');
    expect(calls).toEqual(['cheap']);
  });

  test('falls back to the fallback model when the primary fails', async () => {
    const { run, calls } = scriptedRun({ cheap: new Error('No endpoints found'), chat: 'ok' });
    const result = await runResilientStep({
      stage: LIFECYCLE_STAGE.autoTitle,
      primaryModelId: 'cheap',
      fallbackModelId: 'chat',
      run,
    });
    expect(result).toBe('summary-by-chat');
    expect(calls).toEqual(['cheap', 'chat']);
  });

  test('returns null when both the primary and the fallback fail', async () => {
    const { run, calls } = scriptedRun({ cheap: new Error('dead'), chat: new Error('dead') });
    const result = await runResilientStep({
      stage: LIFECYCLE_STAGE.compaction,
      primaryModelId: 'cheap',
      fallbackModelId: 'chat',
      run,
    });
    expect(result).toBeNull();
    expect(calls).toEqual(['cheap', 'chat']);
  });

  test('uses the fallback when no primary model is resolved', async () => {
    const { run, calls } = scriptedRun({ chat: 'ok' });
    const result = await runResilientStep({
      stage: LIFECYCLE_STAGE.autoTitle,
      primaryModelId: null,
      fallbackModelId: 'chat',
      run,
    });
    expect(result).toBe('summary-by-chat');
    expect(calls).toEqual(['chat']);
  });

  test('returns null without calling run when neither model is available', async () => {
    const { run, calls } = scriptedRun({});
    const result = await runResilientStep({
      stage: LIFECYCLE_STAGE.memorySummary,
      primaryModelId: null,
      fallbackModelId: null,
      run,
    });
    expect(result).toBeNull();
    expect(calls).toEqual([]);
  });

  test('does not retry when the fallback is the same model as the primary', async () => {
    const { run, calls } = scriptedRun({ same: new Error('dead') });
    const result = await runResilientStep({
      stage: LIFECYCLE_STAGE.compaction,
      primaryModelId: 'same',
      fallbackModelId: 'same',
      run,
    });
    expect(result).toBeNull();
    expect(calls).toEqual(['same']);
  });

  test('rethrows a user-cancel abort without trying the fallback', async () => {
    const { run, calls } = scriptedRun({
      cheap: new DOMException('user-cancel', 'AbortError'),
      chat: 'ok',
    });
    await expect(
      runResilientStep({
        stage: LIFECYCLE_STAGE.compaction,
        primaryModelId: 'cheap',
        fallbackModelId: 'chat',
        run,
      }),
    ).rejects.toThrow('user-cancel');
    expect(calls).toEqual(['cheap']);
  });

  test('rethrows an idle-timeout abort without trying the fallback', async () => {
    const { run, calls } = scriptedRun({
      cheap: new DOMException('idle-timeout', 'TimeoutError'),
      chat: 'ok',
    });
    await expect(
      runResilientStep({
        stage: LIFECYCLE_STAGE.compaction,
        primaryModelId: 'cheap',
        fallbackModelId: 'chat',
        run,
      }),
    ).rejects.toThrow('idle-timeout');
    expect(calls).toEqual(['cheap']);
  });

  test('rethrows without falling back when the provided signal is aborted', async () => {
    // A real abort can surface as an error the SDK wrapped or renamed, which the name
    // check would miss; the aborted signal is the reliable tell, matching the stream
    // engine's signal-based abort classification.
    const controller = new AbortController();
    controller.abort();
    const { run, calls } = scriptedRun({ cheap: new Error('wrapped abort') });
    await expect(
      runResilientStep({
        stage: LIFECYCLE_STAGE.compaction,
        primaryModelId: 'cheap',
        fallbackModelId: 'chat',
        signal: controller.signal,
        run,
      }),
    ).rejects.toThrow('wrapped abort');
    expect(calls).toEqual(['cheap']);
  });
});
