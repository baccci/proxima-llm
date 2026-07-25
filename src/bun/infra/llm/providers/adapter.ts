import type { LanguageModel, Tool } from 'ai';
import type { ModelDTO } from '../../../../shared-contracts/schemas/model.schema';

export type ComposerRequest = {
  thinking: boolean;
  effort: string | null;
  webSearch: boolean;
};

export interface ProviderAdapter {
  readonly provider: string;
  buildModel(modelId: string, apiKey: string): LanguageModel;
  buildProviderOptions(model: ModelDTO, req: ComposerRequest): Record<string, unknown> | undefined;
  buildServerTools?(model: ModelDTO, req: ComposerRequest): Record<string, Tool> | undefined;
  effortLevels(model: ModelDTO): string[];
}
