import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { generateText, stepCountIs, tool } from 'ai'
import { z } from 'zod'
import { MEMORY_GUIDANCE } from '../../src/bun/llm/system-prompt'

const EVAL_MODEL = process.env.EVAL_MODEL ?? 'google/gemini-3.5-flash'

export type WriteCall = { scope: 'global' | 'project'; title: string; content: string }
export type ReadCall = { scope: 'global' | 'project'; title: string }
export type DeleteCall = { scope: 'global' | 'project'; title: string }

export type RunInput = {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  existingTitles?: { global: string[]; project: string[] }
}

export type RunResult = {
  writes: WriteCall[]
  reads: ReadCall[]
  deletes: DeleteCall[]
  finalText: string
}

function buildEvalSystem(existingTitles?: { global: string[]; project: string[] }): string {
  const globalTitles = existingTitles?.global ?? []
  const projectTitles = existingTitles?.project ?? []

  const lines = [MEMORY_GUIDANCE]
  lines.push(
    globalTitles.length > 0
      ? `Global notes: ${globalTitles.map((t) => `"${t}"`).join(', ')}`
      : 'Global notes: none saved yet.',
  )
  if (projectTitles.length > 0) {
    lines.push(`Project notes: ${projectTitles.map((t) => `"${t}"`).join(', ')}`)
  }
  return lines.join('\n')
}

export async function runMemoryTurn(input: RunInput): Promise<RunResult> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set — run via bun run eval')

  const model = createOpenRouter({ apiKey })(EVAL_MODEL)
  const writes: WriteCall[] = []
  const reads: ReadCall[] = []
  const deletes: DeleteCall[] = []

  const tools = {
    write_memory: tool({
      description:
        'Save or update a memory slice. Only use for durable, cross-chat facts: stable personal facts, lasting project decisions, or explicit user requests.',
      inputSchema: z.object({
        scope: z.enum(['global', 'project']),
        title: z.string(),
        content: z.string(),
      }),
      execute: async (args) => {
        writes.push(args)
        return { saved: true, title: args.title }
      },
    }),
    read_memory: tool({
      description: 'Read a memory slice by title.',
      inputSchema: z.object({
        scope: z.enum(['global', 'project']),
        title: z.string(),
      }),
      execute: async (args) => {
        reads.push(args)
        return { content: '(eval placeholder)' }
      },
    }),
    delete_memory: tool({
      description: 'Delete a memory slice by title.',
      inputSchema: z.object({
        scope: z.enum(['global', 'project']),
        title: z.string(),
      }),
      execute: async (args) => {
        deletes.push(args)
        return { deleted: true, title: args.title }
      },
    }),
  }

  const result = await generateText({
    model,
    system: buildEvalSystem(input.existingTitles),
    messages: input.messages,
    tools,
    stopWhen: stepCountIs(3),
    temperature: 0,
  })

  return { writes, reads, deletes, finalText: result.text }
}
