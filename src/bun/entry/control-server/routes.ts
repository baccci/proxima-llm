import { z } from 'zod'
import { startChatStream } from '../../engine/chat-stream/chat-stream.service'
import * as chatService from '../../features/chat/chat.repository'
import * as modelService from '../../features/model/model.repository'
import * as settingsService from '../../features/settings/settings.repository'
import * as keychain from '../../infra/keychain'
import { log } from '../../infra/logging/logger'
import { toErrorMessage } from '../../utils/to-error'
import { getActiveChatId, pushControlNavigate, rpcRequestHandlers } from '../rpc'
import * as auth from './auth'
import { BROWSER_BRIDGE_ENABLED } from './bridge-mode'
import { corsHeadersFor, isOriginAllowed } from './cors'
import { broadcast, LIFECYCLE_KIND } from './events'
import { authenticate, err, json } from './http'
import { dispatchRpcCall } from './rpc-dispatch'
import { streamCompletionsResponse } from './sse'

const PairBody = z.object({
  code: z.string().optional(),
  label: z.string().optional(),
})

const PromptBody = z.object({
  text: z.string().optional(),
  target: z.string().optional(),
  model: z.string().optional(),
  project: z.string().optional(),
  thinking: z.boolean().default(false),
  focus: z.boolean().default(false),
})

// Special values for PromptBody.target. Any other value is read as an explicit chat id.
const PROMPT_TARGET = {
  new: 'new',
  active: 'active',
} as const

type ResolveOk = {
  ok: true
  chatId: string
  modelId: string
  content: string
  thinking: boolean
  focus: boolean
}
type ResolveErr = { ok: false; response: Response }

// Validate a /prompt or /completions body and resolve which chat it targets.
// Returns either the resolved chat + model, or a ready-made error Response.
function resolvePromptRequest(raw: unknown): ResolveOk | ResolveErr {
  const parsed = PromptBody.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, response: err('Invalid request body', 400) }
  }

  const body = parsed.data
  if (!body.text) {
    return { ok: false, response: err('Missing text', 400) }
  }

  // Parsed body already confirmed these, so hand them down instead of
  // re-reaching into body (and re-asserting text) at each call site.
  const requestFields = { content: body.text, thinking: body.thinking, focus: body.focus }

  const settings = settingsService.getSettings()
  const modelId = body.model ?? settings.defaultModelId
  if (!modelId) {
    return { ok: false, response: err('No model specified and no default model configured', 400) }
  }

  const model = modelService.getModel(modelId)
  if (!model) {
    return {
      ok: false,
      response: err(`Unknown model: ${modelId}. Call GET /models for valid ids.`, 400),
    }
  }
  if (!model.isEnabled) {
    return {
      ok: false,
      response: err(`Model not enabled: ${modelId}. Call GET /models for available ids.`, 400),
    }
  }
  if (!keychain.getApiKey(model.provider)) {
    return {
      ok: false,
      response: err(`No API key configured for provider: ${model.provider}`, 400),
    }
  }

  // Resolve which chat the prompt lands in: a brand-new chat, whatever the UI has
  // open, or an explicit chat id. Each branch returns its own success so there is no
  // shared mutable to carry down.
  const target = body.target ?? PROMPT_TARGET.new

  if (target === PROMPT_TARGET.new) {
    const created = chatService.createChat({
      modelId,
      ...(body.project ? { projectId: body.project } : {}),
    })
    return { ok: true, chatId: created.id, modelId, ...requestFields }
  }

  if (target === PROMPT_TARGET.active) {
    const active = getActiveChatId()
    if (!active) {
      return { ok: false, response: err('No active chat', 409) }
    }

    return { ok: true, chatId: active, modelId, ...requestFields }
  }

  const existing = chatService.getChat(target)
  if (!existing) {
    return { ok: false, response: err(`Chat not found: ${target}`, 404) }
  }

  return { ok: true, chatId: target, modelId, ...requestFields }
}

export async function handleRequest(req: Request): Promise<Response> {
  const origin = req.headers.get('origin')
  const response = await routeRequest(req, origin)

  // The grant goes on every reply rather than on one route, because a browser needs it
  // to read any of them. Callers that send no Origin get no extra headers.
  for (const [key, value] of Object.entries(corsHeadersFor(origin, BROWSER_BRIDGE_ENABLED))) {
    response.headers.set(key, value)
  }

  return response
}

async function routeRequest(req: Request, origin: string | null): Promise<Response> {
  try {
    const url = new URL(req.url)
    const { pathname } = url

    // Block non-localhost (belt + suspenders on top of the bind)
    const host = req.headers.get('host') ?? ''
    if (!host.startsWith('127.0.0.1') && !host.startsWith('localhost')) {
      return err('Forbidden', 403)
    }

    // Reject cross-origin requests, bar the dev server while the bridge is enabled
    if (!isOriginAllowed(origin, host, BROWSER_BRIDGE_ENABLED)) {
      return err('Forbidden', 403)
    }

    // --- OPTIONS (CORS preflight) ---
    // A JSON POST from a browser is preflighted, and the origin check above has already
    // decided whether this caller is welcome, so there is nothing left to answer with.
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204 })
    }

    // --- POST /rpc (unauthenticated, dev-only) ---
    // The browser bridge: the renderer's own RPC surface, reachable over HTTP so the
    // real frontend can run in a plain browser tab against this same process.
    if (pathname === '/rpc' && req.method === 'POST' && BROWSER_BRIDGE_ENABLED) {
      const dispatched = await dispatchRpcCall(
        await req.json().catch(() => null),
        rpcRequestHandlers,
      )
      if (!dispatched.ok) {
        return err(dispatched.message, dispatched.status)
      }

      return json(dispatched.payload)
    }

    // --- POST /pair (unauthenticated) ---
    if (pathname === '/pair' && req.method === 'POST') {
      const parsed = PairBody.safeParse(await req.json().catch(() => null))
      if (!parsed.success) {
        return err('Invalid request body', 400)
      }

      const body = parsed.data
      if (!body.code) {
        return err('Missing code', 400)
      }
      if (!auth.consumePairingCode(body.code)) {
        return err('Invalid or expired code', 401)
      }

      const label = body.label ?? 'Connected Client'
      const token = auth.mintToken(label)
      return json({ token })
    }

    // All other routes require a valid bearer token
    if (!authenticate(req)) {
      return err('Unauthorized', 401)
    }

    // --- GET /chats ---
    if (pathname === '/chats' && req.method === 'GET') {
      // The remote client wants every chat in one response, so this uses the
      // unpaginated listAllChats rather than the UI's keyset-paged listChats.
      return json(chatService.listAllChats(null))
    }

    // --- GET /models ---
    if (pathname === '/models' && req.method === 'GET') {
      const allModels = modelService
        .listModels()
        .filter((m) => m.isEnabled)
        .map((m) => ({
          id: m.id,
          displayName: m.displayName,
          provider: m.provider,
          family: m.family,
          available: !!keychain.getApiKey(m.provider),
        }))
      return json(allModels)
    }

    // --- POST /prompt ---
    if (pathname === '/prompt' && req.method === 'POST') {
      const resolved = resolvePromptRequest(await req.json().catch(() => null))
      if (!resolved.ok) {
        return resolved.response
      }

      const { chatId, modelId, content, thinking, focus } = resolved

      const { streamId, assistantMessageId } = startChatStream(
        { chatId, modelId, content, thinking },
        {
          onLifecycle: (event, meta) => {
            broadcast({ event, chatId: meta.chatId, streamId: meta.streamId })
          },
        },
      )

      pushControlNavigate({ chatId, streamId, assistantMessageId, focus })
      broadcast({ event: LIFECYCLE_KIND.accepted, chatId, streamId })

      return json({ chatId, streamId }, 202)
    }

    // --- POST /completions ---  (SSE: streams the response back to the caller)
    if (pathname === '/completions' && req.method === 'POST') {
      const resolved = resolvePromptRequest(await req.json().catch(() => null))
      if (!resolved.ok) {
        return resolved.response
      }

      return streamCompletionsResponse({
        chatId: resolved.chatId,
        modelId: resolved.modelId,
        content: resolved.content,
        thinking: resolved.thinking,
      })
    }

    return err('Not found', 404)
  } catch (e) {
    const message = toErrorMessage(e)
    log.error('[control-server] Unhandled error', e)
    return err(message, 500)
  }
}
