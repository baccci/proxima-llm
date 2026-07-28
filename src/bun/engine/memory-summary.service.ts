import type { ProviderId } from '../../shared-contracts/providers/registry'
import { MemoryScope } from '../../shared-contracts/schemas/memory-slice.schema'
import { listSlices } from '../features/memory/memory.repository'
import { emitMemoryChanged } from '../features/memory/memory-notify'
import { generateMemorySummary } from '../features/memory/memory-summary-llm'
import { listModels } from '../features/model/model.repository'
import { resolveTitleModel } from '../features/model/title-model.service'
import * as projectService from '../features/project/project.repository'
import * as keychain from '../infra/keychain'
import { log } from '../infra/logging/logger'
import { runResilientStep } from './lifecycle/resilient-step'
import { LIFECYCLE_STAGE } from './lifecycle/stages'

function resolveGenArgs(projectId: string): {
  provider: ProviderId
  modelId: string
  apiKey: string
  fallbackModelId: string | null
} | null {
  const defaultModelId = projectService.getDefaultModelId(projectId)

  const allModels = listModels()

  let preferredProvider: ProviderId | null = null
  if (defaultModelId) {
    const defaultModel = allModels.find((m) => m.id === defaultModelId && m.isEnabled)
    if (defaultModel) {
      preferredProvider = defaultModel.provider
    }
  }

  const enabledProviders = [...new Set(allModels.filter((m) => m.isEnabled).map((m) => m.provider))]
  const providers = preferredProvider
    ? [preferredProvider, ...enabledProviders.filter((p) => p !== preferredProvider)]
    : enabledProviders

  for (const provider of providers) {
    const modelId = resolveTitleModel(provider)
    if (!modelId) {
      continue
    }
    const apiKey = keychain.getApiKey(provider)
    if (!apiKey) {
      continue
    }
    // The project's default model, when it lives on the chosen provider, is a
    // known-good fallback if the cheap pick has no live endpoints. It is enabled and
    // on this provider exactly when this provider is the preferred one.
    const fallbackModelId = provider === preferredProvider ? defaultModelId : null
    return { provider, modelId, apiKey, fallbackModelId }
  }

  return null
}

// Per-project generation token. Rapid edits fire overlapping async regens; only the
// latest may persist, so a slower earlier call can't clobber a newer summary.
const genTokens = new Map<string, number>()

export async function regenerateProjectSummary(projectId: string): Promise<void> {
  const token = (genTokens.get(projectId) ?? 0) + 1
  genTokens.set(projectId, token)

  const slices = listSlices(MemoryScope.enum.project, projectId)

  if (slices.length === 0) {
    projectService.setMemorySummary(projectId, null)
    emitMemoryChanged(MemoryScope.enum.project, projectId)
    return
  }

  const args = resolveGenArgs(projectId)
  if (!args) {
    return
  }

  try {
    const summary = await runResilientStep({
      stage: LIFECYCLE_STAGE.memorySummary,
      primaryModelId: args.modelId,
      fallbackModelId: args.fallbackModelId,
      run: (modelId) => generateMemorySummary(slices, args.provider, args.apiKey, modelId),
    })
    if (genTokens.get(projectId) !== token) {
      return // superseded by a newer regen
    }
    if (summary == null) {
      return // every attempt failed; leave the existing summary in place
    }
    projectService.setMemorySummary(projectId, summary)
    emitMemoryChanged(MemoryScope.enum.project, projectId)
  } catch (err) {
    log.error('Memory summary generation failed (non-fatal)', err)
  }
}
