import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import type { LanguageModel } from 'ai';
import { effortLevelsForModel } from '../../../../shared-contracts/models/effort';
import type { ModelDTO } from '../../../../shared-contracts/schemas/model.schema';
import type { ComposerRequest, ProviderAdapter } from './adapter';

export class OpenRouterAdapter implements ProviderAdapter {
  readonly provider = 'openrouter';

  buildModel(modelId: string, apiKey: string): LanguageModel {
    return createOpenRouter({ apiKey })(modelId);
  }

  buildProviderOptions(model: ModelDTO, req: ComposerRequest): Record<string, unknown> | undefined {
    const opts: Record<string, unknown> = {};

    if (model.capabilities.thinking) {
      if (req.thinking) {
        opts.reasoning = { enabled: true, ...(req.effort ? { effort: req.effort } : {}) };
      } else {
        opts.reasoning = { enabled: false };
      }
    }

    if (req.webSearch) {
      opts.plugins = [{ id: 'web' }];
    }

    if (Object.keys(opts).length === 0) return undefined;
    return { openrouter: opts };
  }

  effortLevels(model: ModelDTO): string[] {
    return effortLevelsForModel(model);
  }
}
