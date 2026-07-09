import type { ProviderId } from '../../shared-contracts/providers/registry';
import * as keychain from '../core/keychain';
import { log } from '../core/logging/logger';
import { listSlices } from '../features/memory/memory.repository';
import { emitMemoryChanged } from '../features/memory/memory-notify';
import { generateMemorySummary } from '../features/memory/memory-summary-llm';
import { listModels } from '../features/model/model.repository';
import { resolveTitleModel } from '../features/model/title-model.service';
import * as projectService from '../features/project/project.repository';

function resolveGenArgs(
  projectId: string,
): { provider: ProviderId; modelId: string; apiKey: string } | null {
  const defaultModelId = projectService.getDefaultModelId(projectId);

  const allModels = listModels();

  let preferredProvider: ProviderId | null = null;
  if (defaultModelId) {
    const defaultModel = allModels.find((m) => m.id === defaultModelId && m.isEnabled);
    if (defaultModel) preferredProvider = defaultModel.provider;
  }

  const enabledProviders = [
    ...new Set(allModels.filter((m) => m.isEnabled).map((m) => m.provider)),
  ];
  const providers = preferredProvider
    ? [preferredProvider, ...enabledProviders.filter((p) => p !== preferredProvider)]
    : enabledProviders;

  for (const provider of providers) {
    const modelId = resolveTitleModel(provider);
    if (!modelId) continue;
    const apiKey = keychain.getApiKey(provider);
    if (!apiKey) continue;
    return { provider, modelId, apiKey };
  }

  return null;
}

// Per-project generation token. Rapid edits fire overlapping async regens; only the
// latest may persist, so a slower earlier call can't clobber a newer summary.
const genTokens = new Map<string, number>();

export async function regenerateProjectSummary(projectId: string): Promise<void> {
  const token = (genTokens.get(projectId) ?? 0) + 1;
  genTokens.set(projectId, token);

  const slices = listSlices('project', projectId);

  if (slices.length === 0) {
    projectService.setMemorySummary(projectId, null);
    emitMemoryChanged('project', projectId);
    return;
  }

  const args = resolveGenArgs(projectId);
  if (!args) return;

  try {
    const summary = await generateMemorySummary(slices, args.provider, args.apiKey, args.modelId);
    if (genTokens.get(projectId) !== token) return; // superseded by a newer regen
    projectService.setMemorySummary(projectId, summary);
    emitMemoryChanged('project', projectId);
  } catch (err) {
    log.error('Memory summary generation failed (non-fatal)', err);
  }
}
