import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import type { LanguageModel } from 'ai'
import type { ModelDTO } from '../../../../shared-contracts/schemas/model.schema'
import type { ComposerRequest, ProviderAdapter } from './adapter'

export class OpenRouterAdapter implements ProviderAdapter {
  readonly provider = 'openrouter'

  buildModel(modelId: string, apiKey: string): LanguageModel {
    return createOpenRouter({ apiKey })(modelId)
  }

  buildProviderOptions(model: ModelDTO, req: ComposerRequest): Record<string, unknown> | undefined {
    const opts: Record<string, unknown> = {}

    if (model.capabilities.thinking) {
      // Mandatory-reasoning models 400 on enabled:false. The UI already prevents the
      // off state, but guard here too so a stale client can't send the bad request.
      if (req.thinking || model.capabilities.reasoningMandatory) {
        opts.reasoning = { enabled: true, ...(req.effort ? { effort: req.effort } : {}) }
      } else {
        opts.reasoning = { enabled: false }
      }
    }

    if (req.webSearch) {
      opts.plugins = [{ id: 'web' }]
    }

    if (Object.keys(opts).length === 0) {
      return undefined
    }
    return { openrouter: opts }
  }
}
