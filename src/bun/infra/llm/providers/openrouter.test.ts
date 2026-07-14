import { describe, expect, test } from 'bun:test';
import type { ModelDTO } from '../../../../shared-contracts/schemas/model.schema';
import type { ComposerRequest } from './adapter';
import { OpenRouterAdapter } from './openrouter';

const adapter = new OpenRouterAdapter();

// buildProviderOptions reads only model.capabilities, so a minimal cast stub is enough.
function model(caps: Partial<ModelDTO['capabilities']> = {}): ModelDTO {
  return { capabilities: caps } as ModelDTO;
}

function req(over: Partial<ComposerRequest> = {}): ComposerRequest {
  return { thinking: false, effort: null, webSearch: false, ...over };
}

describe('OpenRouterAdapter.buildProviderOptions', () => {
  test('thinking on enables reasoning, with effort when set', () => {
    const opts = adapter.buildProviderOptions(
      model({ thinking: true }),
      req({ thinking: true, effort: 'medium' }),
    );
    expect(opts).toEqual({ openrouter: { reasoning: { enabled: true, effort: 'medium' } } });
  });

  test('thinking capability but request off disables reasoning', () => {
    const opts = adapter.buildProviderOptions(model({ thinking: true }), req({ thinking: false }));
    expect(opts).toEqual({ openrouter: { reasoning: { enabled: false } } });
  });

  test('web search adds the web plugin', () => {
    const opts = adapter.buildProviderOptions(model({}), req({ webSearch: true }));
    expect(opts).toEqual({ openrouter: { plugins: [{ id: 'web' }] } });
  });

  test('no thinking and no web search yields undefined', () => {
    const opts = adapter.buildProviderOptions(model({}), req());
    expect(opts).toBeUndefined();
  });
});
