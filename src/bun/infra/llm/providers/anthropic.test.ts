import { describe, expect, test } from 'bun:test';
import type { ModelDTO } from '../../../../shared-contracts/schemas/model.schema';
import type { ComposerRequest } from './adapter';
import { AnthropicAdapter } from './anthropic';

const adapter = new AnthropicAdapter();

// buildProviderOptions / buildServerTools read only model.capabilities, so a minimal cast stub is enough.
function model(caps: Partial<ModelDTO['capabilities']> = {}): ModelDTO {
  return { capabilities: caps } as ModelDTO;
}

function req(over: Partial<ComposerRequest> = {}): ComposerRequest {
  return { thinking: false, effort: null, webSearch: false, ...over };
}

describe('AnthropicAdapter.buildProviderOptions', () => {
  test('prompt caching adds ephemeral cacheControl', () => {
    const opts = adapter.buildProviderOptions(model({ promptCaching: true }), req());
    expect(opts).toEqual({ anthropic: { cacheControl: { type: 'ephemeral' } } });
  });

  test('thinking on maps to adaptive, with effort when set', () => {
    const opts = adapter.buildProviderOptions(
      model({ thinking: true }),
      req({ thinking: true, effort: 'high' }),
    );
    expect(opts).toEqual({
      anthropic: { thinking: { type: 'adaptive' }, output_config: { effort: 'high' } },
    });
  });

  test('thinking capability but request off maps to disabled', () => {
    const opts = adapter.buildProviderOptions(model({ thinking: true }), req({ thinking: false }));
    expect(opts).toEqual({ anthropic: { thinking: { type: 'disabled' } } });
  });

  test('no caching and no thinking yields undefined', () => {
    const opts = adapter.buildProviderOptions(model({}), req());
    expect(opts).toBeUndefined();
  });
});

describe('AnthropicAdapter.buildServerTools', () => {
  test('web search on registers a web_search tool', () => {
    const tools = adapter.buildServerTools(model({}), req({ webSearch: true }));
    expect(tools).toBeDefined();
    expect(tools).toHaveProperty('web_search');
  });

  test('web search off yields undefined', () => {
    const tools = adapter.buildServerTools(model({}), req({ webSearch: false }));
    expect(tools).toBeUndefined();
  });
});
