import type { Effort } from '@shared/models/effort'
import type { ModelDTO } from '@shared/schemas/model.schema'
import type { LanguageModel, Tool } from 'ai'

export type ComposerRequest = {
  thinking: boolean
  effort: Effort | null
  webSearch: boolean
}

export interface ProviderAdapter {
  readonly provider: string
  buildModel(modelId: string, apiKey: string): LanguageModel
  buildProviderOptions(model: ModelDTO, req: ComposerRequest): Record<string, unknown> | undefined
  buildServerTools?(model: ModelDTO, req: ComposerRequest): Record<string, Tool> | undefined
}
