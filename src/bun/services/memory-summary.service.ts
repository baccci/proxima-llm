import { generateMemorySummary } from '../llm/memory-summary';
import { log } from '../logging/logger';
import * as keychain from '../secrets/keychain';
import { listSlices } from './memory.service';
import { listModels } from './model.service';
import * as projectService from './project.service';
import { resolveTitleModel } from './title-model.service';

type Scope = 'global' | 'project';

let pushMemoryChanged: ((scope: Scope, projectId: string | null) => void) | null = null;

export function setMemoryChangedPush(fn: (scope: Scope, projectId: string | null) => void): void {
  pushMemoryChanged = fn;
}

// Single entry point for every memory write/delete path (RPC user edits + model
// tools). Pushes immediately so the slice list refreshes without a restart, then
// kicks off async summary regen for project scope.
export function notifyMemoryChanged(scope: Scope, projectId: string | null): void {
  pushMemoryChanged?.(scope, projectId);
  if (scope === 'project' && projectId) void regenerateProjectSummary(projectId);
}

function resolveGenArgs(
  projectId: string,
): { provider: string; modelId: string; apiKey: string } | null {
  const defaultModelId = projectService.getDefaultModelId(projectId);

  const allModels = listModels();

  let preferredProvider: string | null = null;
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
    pushMemoryChanged?.('project', projectId);
    return;
  }

  const args = resolveGenArgs(projectId);
  if (!args) return;

  try {
    const summary = await generateMemorySummary(slices, args.provider, args.apiKey, args.modelId);
    if (genTokens.get(projectId) !== token) return; // superseded by a newer regen
    projectService.setMemorySummary(projectId, summary);
    pushMemoryChanged?.('project', projectId);
  } catch (err) {
    log.error('Memory summary generation failed (non-fatal)', err);
  }
}
