import type { ModelDTO } from '@shared/schemas/model.schema'

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
  if (model.provider === 'anthropic') return 'Anthropic'
  const vendor = model.id.split('/')[0] ?? model.provider
  return VENDOR_LABELS[vendor] ?? vendor.charAt(0).toUpperCase() + vendor.slice(1)
}
