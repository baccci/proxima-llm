import type { Effort } from '@shared/models/effort'
import { providerSupportsWebSearch } from '@shared/providers/registry'
import type { StreamChunk } from '@shared/rpc/app-rpc.types'
import type {
  MessageDTO,
  MessagePart,
  StopReason,
  TokenUsage,
} from '@shared/schemas/message.schema'
import type { ModelDTO } from '@shared/schemas/model.schema'
import type { ProjectDTO } from '@shared/schemas/project.schema'
import type { ToolDecision } from '@shared/tools/tool-policy'
import { stepCountIs, streamText } from 'ai'
import type { CompactionSnapshot } from '../../features/compaction/compaction.repository'
import { buildModel, getAdapter } from '../../infra/llm/providers/index'
import { buildSystem, type ResolveAttachment, toCoreMessages } from './build-prompt'
import { consumeStream } from './consume-stream'
import { type ApprovalResult, buildGatedTools } from './gate-tools'
import { createIdleTimeout } from './idle-timeout'
import { createStreamAccumulator } from './stream-accumulator'
import { classifyAbort, extractUsage } from './stream-result'

// Max agentic steps before the run stops on its own (tool-call round trips). Six
// rather than five leaves a step for the model to acknowledge a denied tool call
// and ask how to proceed, instead of spending its last round-trip on a retry.
const MAX_STEPS = 6

type StreamOptions = {
  model: ModelDTO
  apiKey: string
  project: ProjectDTO | null
  history: MessageDTO[]
  snapshot?: CompactionSnapshot
  thinking: boolean
  webSearch: boolean
  effort?: Effort | null
  sliceTitles?: { global: string[]; project: string[] }
  projectFileNames?: string[]
  getToolGrant: (toolName: string) => ToolDecision | undefined
  setToolGrant: (toolName: string, decision: ToolDecision) => void
  onChunk: (chunk: StreamChunk) => void
  awaitApproval: (toolCallId: string, toolName: string, input: unknown) => Promise<ApprovalResult>
  signal: AbortSignal
  maxRetries: number
  requestTimeoutMs: number
  resolveAttachment: ResolveAttachment
}

export async function runStream(opts: StreamOptions): Promise<{
  parts: MessagePart[]
  usage: TokenUsage | null
  stopReason?: StopReason
}> {
  // 1. Assemble the request: web-search gate, model, system prompt, tools.
  const webSearchActive =
    opts.webSearch &&
    providerSupportsWebSearch(opts.model.provider) &&
    opts.model.capabilities.webSearch

  const languageModel = buildModel(opts.model, opts.apiKey)
  const system = buildSystem(
    opts.model,
    opts.project,
    webSearchActive,
    opts.sliceTitles,
    opts.projectFileNames,
    opts.snapshot,
  )
  const serverTools = getAdapter(opts.model.provider).buildServerTools?.(opts.model, {
    thinking: opts.thinking,
    effort: opts.effort ?? null,
    webSearch: webSearchActive,
  })
  const tools = {
    ...buildGatedTools(
      opts.project?.id,
      opts.onChunk,
      opts.awaitApproval,
      opts.getToolGrant,
      opts.setToolGrant,
    ),
    ...(serverTools ?? {}),
  }

  // 2. Arm the idle guard and merge it with the user-cancel signal. Either one
  // aborting ends the turn: a stalled model (idle) or the renderer's stop button.
  const idle = createIdleTimeout(opts.requestTimeoutMs)
  const abortSignal = AbortSignal.any([opts.signal, idle.signal])

  const providerOptions = getAdapter(opts.model.provider).buildProviderOptions(opts.model, {
    thinking: opts.thinking,
    effort: opts.effort ?? null,
    webSearch: webSearchActive,
  }) as Parameters<typeof streamText>[0]['providerOptions']

  // 3. Kick off the stream. stopWhen caps the agentic tool round-trips.
  const result = streamText({
    model: languageModel,
    system,
    messages: toCoreMessages(opts.history, opts.resolveAttachment, opts.snapshot),
    tools,
    stopWhen: stepCountIs(MAX_STEPS),
    abortSignal,
    maxRetries: opts.maxRetries,
    ...(providerOptions ? { providerOptions } : {}),
  })

  // 4. Drain the stream into live chunks + the accumulator, poking the idle guard
  // on every delta. An abort arrives one of two ways: thrown out of the loop
  // (caught here) or as an error delta that ends the loop cleanly (recovered in
  // phase 5). Either way the merged signal is aborted, so we classify from it.
  const acc = createStreamAccumulator()
  let stopReason: StopReason | undefined

  try {
    await consumeStream(result.fullStream, {
      onChunk: opts.onChunk,
      acc,
      onActivity: idle.reset,
    })
  } catch (err) {
    if (!abortSignal.aborted) {
      throw err
    }

    stopReason = classifyAbort(abortSignal)
  } finally {
    idle.clear()
  }

  // 5. Finish: build the parts, recover a clean-loop abort, then either surface a
  // real error or return the parsed usage.
  const { parts, error: streamError } = acc.finish()

  if (!stopReason && abortSignal.aborted) {
    stopReason = classifyAbort(abortSignal)
  }

  if (stopReason) {
    return { parts, usage: null, stopReason }
  }

  if (streamError) {
    throw streamError
  }

  const rawUsage = await result.usage
  const meta = await result.providerMetadata
  const usage = extractUsage(rawUsage, meta)

  return { parts, usage }
}
