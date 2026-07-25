import { ProviderId } from '@shared/providers/registry'
import type { ModelDTO } from '@shared/schemas/model.schema'
import { capitalize } from '@utils/capitalize'

const VENDOR_LABELS: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  'meta-llama': 'Meta',
  mistralai: 'Mistral',
  cohere: 'Cohere',
  'amazon-bedrock': 'Amazon',
  'x-ai': 'xAI',
  deepseek: 'DeepSeek',
  qwen: 'Qwen',
  nvidia: 'NVIDIA',
  microsoft: 'Microsoft',
  '01-ai': '01.AI',
}

export function modelCompany(model: ModelDTO): string {
  // Anthropic model ids are not vendor/model-namespaced, so resolve by provider.
  if (model.provider === ProviderId.enum.anthropic) {
    return 'Anthropic'
  }

  const vendor = model.id.split('/')[0] ?? model.provider
  return VENDOR_LABELS[vendor] ?? capitalize(vendor)
}
