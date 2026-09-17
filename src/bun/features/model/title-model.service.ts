import type { ProviderId } from '@shared/providers/registry'
import { getSettings } from '../settings/settings.repository'
import { listModels } from './model.repository'
import { selectTitleModel } from './select-title-model'

// Resolves which model auto-names new chats (and writes the compaction / memory
// summaries) for a given provider. The selection logic is the pure selectTitleModel;
// this wrapper only supplies the IO: the live model list and the user's per-provider
// title-model setting.
export function resolveTitleModel(provider: ProviderId): string | null {
  return selectTitleModel(listModels(), getSettings().titleModels[provider], provider)
}
