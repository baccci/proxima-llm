import { anthropic as anthropicProvider, createAnthropic } from '@ai-sdk/anthropic'
import type { LanguageModel, Tool } from 'ai'
import type { ModelDTO } from '../../../../shared-contracts/schemas/model.schema'
import type { ComposerRequest, ProviderAdapter } from './adapter'

export class AnthropicAdapter implements ProviderAdapter {
  readonly provider = 'anthropic'

  buildModel(modelId: string, apiKey: string): LanguageModel {
    return createAnthropic({ apiKey })(modelId)
  }

  buildProviderOptions(model: ModelDTO, req: ComposerRequest): Record<string, unknown> | undefined {
    const opts: Record<string, unknown> = {}

    if (model.capabilities.promptCaching) {
      opts.cacheControl = { type: 'ephemeral' }
    }

    if (model.capabilities.thinking) {
      opts.thinking = req.thinking ? { type: 'adaptive' } : { type: 'disabled' }
      if (req.thinking && req.effort) {
        opts.output_config = { effort: req.effort }
      }
    }

    if (Object.keys(opts).length === 0) {
      return undefined
    }
    return { anthropic: opts }
  }

  buildServerTools(_model: ModelDTO, req: ComposerRequest): Record<string, Tool> | undefined {
    if (!req.webSearch) {
      return undefined
    }
    return {
      // Cast bridges the provider-utils `Tool` returned by the factory to the `Tool` from `ai`
      // (version skew between the two packages); shapes are compatible at runtime.
      web_search: anthropicProvider.tools.webSearch_20260209({ maxUses: 5 }) as unknown as Tool,
    }
  }
}
