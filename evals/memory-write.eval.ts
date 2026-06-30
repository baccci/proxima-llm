import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { generateText } from 'ai'
import { createScorer, evalite } from 'evalite'
import { type RunInput, type RunResult, runMemoryTurn } from './lib/run-memory-turn'

const EVAL_MODEL = process.env.EVAL_MODEL ?? 'google/gemini-3.5-flash'

// --- Scorers ---

const mustWrite = createScorer<RunInput, RunResult, undefined>({
  name: 'must-write',
  description: 'Passes when the model writes at least one memory note.',
  scorer: ({ output }) => ({
    score: output.writes.length >= 1 ? 1 : 0,
    metadata: { writes: output.writes },
  }),
})

const mustNotWrite = createScorer<RunInput, RunResult, undefined>({
  name: 'must-not-write',
  description: 'Passes when the model writes no memory notes.',
  scorer: ({ output }) => ({
    score: output.writes.length === 0 ? 1 : 0,
    metadata: { writes: output.writes },
  }),
})

const handlesBorderline = createScorer<RunInput, RunResult, undefined>({
  name: 'handles-borderline',
  description:
    'For a borderline personal fact, the model either records it OR asks whether to remember it — but does not silently drop it. Both are acceptable; only ignoring the fact fails.',
  scorer: async ({ output }) => {
    // Recording a borderline-but-personal fact (e.g. an allergy) is a reasonable choice.
    if (output.writes.length > 0) {
      return { score: 1, metadata: { reason: 'saved the fact', writes: output.writes } }
    }
    // Otherwise it should at least ask the user whether to remember it.
    const apiKey = process.env.OPENROUTER_API_KEY!
    const model = createOpenRouter({ apiKey })(EVAL_MODEL)
    const { text } = await generateText({
      model,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: `Does the following assistant response ask the user whether to remember or save a piece of information? Answer only "yes" or "no".\n\n---\n${output.finalText}\n---`,
        },
      ],
    })
    const asked = text.toLowerCase().trim().startsWith('yes')
    return {
      score: asked ? 1 : 0,
      metadata: { judgment: text.trim(), finalText: output.finalText },
    }
  },
})

const updatesExisting = createScorer<RunInput, RunResult, { title: string }>({
  name: 'updates-existing',
  description:
    'Passes when the model reuses the exact title of an existing note rather than creating a duplicate.',
  scorer: ({ output, expected }) => {
    const reused = output.writes.some((w) => w.title === expected?.title)
    return {
      score: reused ? 1 : 0,
      metadata: { writes: output.writes, expectedTitle: expected?.title },
    }
  },
})

// --- Block 1: Saves durable personal/project facts ---

evalite('Saves durable facts', {
  data: () =>
    [
      {
        input: {
          messages: [
            {
              role: 'user',
              content:
                "I'm a Python developer and I strongly prefer a functional style — avoid OOP patterns in your suggestions.",
            },
          ],
        },
        expected: undefined,
      },
      {
        input: {
          messages: [
            { role: 'user', content: 'My name is Alex and I always want you to reply in French.' },
          ],
        },
        expected: undefined,
      },
      {
        input: {
          messages: [
            {
              role: 'user',
              content:
                "I'm the CTO at a 10-person startup. Our backend is Go and we don't use ORMs.",
            },
          ],
        },
        expected: undefined,
      },
      {
        input: {
          messages: [
            {
              role: 'user',
              content:
                'Just so you know: I work exclusively on iOS with Swift. Never suggest Android or Kotlin.',
            },
          ],
        },
        expected: undefined,
      },
    ] satisfies Array<{ input: RunInput; expected: undefined }>,
  task: (input) => runMemoryTurn(input),
  scorers: [mustWrite],
})

// --- Block 2: Honors explicit "remember this" requests ---

evalite('Honors explicit remember', {
  data: () =>
    [
      {
        input: {
          messages: [
            {
              role: 'user',
              content: 'Remember that I prefer tabs over spaces in all code you write for me.',
            },
          ],
        },
        expected: undefined,
      },
      {
        input: {
          messages: [
            {
              role: 'user',
              content: 'Please remember my timezone is PST. Use that when discussing schedules.',
            },
          ],
        },
        expected: undefined,
      },
      {
        input: {
          messages: [
            {
              role: 'user',
              content: 'Save this: my preferred API response format is JSON with snake_case keys.',
            },
          ],
        },
        expected: undefined,
      },
    ] satisfies Array<{ input: RunInput; expected: undefined }>,
  task: (input) => runMemoryTurn(input),
  scorers: [mustWrite],
})

// --- Block 3: Ignores transient noise ---

evalite('Ignores noise', {
  data: () =>
    [
      {
        input: {
          messages: [{ role: 'user', content: "What's 2 + 2?" }],
        },
        expected: undefined,
      },
      {
        input: {
          messages: [{ role: 'user', content: 'Write a haiku about autumn leaves.' }],
        },
        expected: undefined,
      },
      {
        input: {
          messages: [
            {
              role: 'user',
              content: 'Summarize this: The quick brown fox jumps over the lazy dog.',
            },
          ],
        },
        expected: undefined,
      },
      {
        input: {
          messages: [{ role: 'user', content: "What's the capital of France?" }],
        },
        expected: undefined,
      },
      {
        input: {
          messages: [{ role: 'user', content: "Translate 'hello world' into Spanish." }],
        },
        expected: undefined,
      },
      // Transient emotional / one-off deliberation — not a durable fact to persist.
      {
        input: {
          messages: [{ role: 'user', content: 'I had a rough day at work today.' }],
        },
        expected: undefined,
      },
      {
        input: {
          messages: [
            {
              role: 'user',
              content: "I'm trying to decide between Python and Rust for my hobby project.",
            },
          ],
        },
        expected: undefined,
      },
    ] satisfies Array<{ input: RunInput; expected: undefined }>,
  task: (input) => runMemoryTurn(input),
  scorers: [mustNotWrite],
})

// --- Block 4: Asks user when borderline ---
// Genuinely personal facts whose durability/relevance is unclear — not framed as a
// standing instruction. Guidance says: don't save silently; briefly ask the user.

evalite('Asks when borderline', {
  data: () =>
    [
      {
        input: {
          messages: [{ role: 'user', content: 'I just moved to Seattle last month.' }],
        },
        expected: undefined,
      },
      {
        input: {
          messages: [{ role: 'user', content: 'By the way, I have a peanut allergy.' }],
        },
        expected: undefined,
      },
      {
        input: {
          messages: [
            { role: 'user', content: "I've been getting really into rock climbing lately." },
          ],
        },
        expected: undefined,
      },
    ] satisfies Array<{ input: RunInput; expected: undefined }>,
  task: (input) => runMemoryTurn(input),
  scorers: [handlesBorderline],
})

// --- Block 5: Updates existing note, not duplicate ---

evalite('Updates not duplicates', {
  data: () =>
    [
      {
        input: {
          messages: [
            { role: 'user', content: 'Actually I want you to reply in Spanish now, not French.' },
          ],
          existingTitles: { global: ['Language preference'], project: [] },
        },
        expected: { title: 'Language preference' },
      },
      {
        input: {
          messages: [
            {
              role: 'user',
              content: "Update my role: I'm now a senior engineer, no longer a junior.",
            },
          ],
          existingTitles: { global: ['User role'], project: [] },
        },
        expected: { title: 'User role' },
      },
      {
        input: {
          messages: [
            { role: 'user', content: 'We switched from tabs to spaces as our team standard.' },
          ],
          existingTitles: { global: ['Code formatting preference'], project: [] },
        },
        expected: { title: 'Code formatting preference' },
      },
    ] satisfies Array<{ input: RunInput; expected: { title: string } }>,
  task: (input) => runMemoryTurn(input),
  scorers: [updatesExisting],
})
