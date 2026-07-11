import { startChatStream } from '../../engine/chat-stream/chat-stream.service';
import * as chatService from '../../features/chat/chat.repository';
import * as modelService from '../../features/model/model.repository';
import * as settingsService from '../../features/settings/settings.repository';
import * as keychain from '../../infra/keychain';
import { log } from '../../infra/logging/logger';
import { getActiveChatId, pushControlNavigate } from '../rpc';
import * as auth from './auth';
import { broadcast } from './events';
import { authenticate, err, json } from './http';

type PromptBody = {
  text?: string;
  target?: string;
  model?: string;
  project?: string;
  thinking?: boolean;
  focus?: boolean;
};

type ResolveOk = { ok: true; chatId: string; modelId: string };
type ResolveErr = { ok: false; response: Response };

// Validate a /prompt or /completions body and resolve which chat it targets.
// Returns either the resolved chat + model, or a ready-made error Response.
function resolvePromptRequest(body: PromptBody | null): ResolveOk | ResolveErr {
  if (!body?.text) return { ok: false, response: err('Missing text', 400) };

  const settings = settingsService.getSettings();
  const modelId = body.model ?? settings.defaultModelId;
  if (!modelId)
    return { ok: false, response: err('No model specified and no default model configured', 400) };

  const model = modelService.getModel(modelId);
  if (!model) {
    return {
      ok: false,
      response: err(`Unknown model: ${modelId}. Call GET /models for valid ids.`, 400),
    };
  }
  if (!model.isEnabled) {
    return {
      ok: false,
      response: err(`Model not enabled: ${modelId}. Call GET /models for available ids.`, 400),
    };
  }
  if (!keychain.getApiKey(model.provider)) {
    return {
      ok: false,
      response: err(`No API key configured for provider: ${model.provider}`, 400),
    };
  }

  const target = body.target ?? 'new';
  let chatId: string;
  if (target === 'new') {
    const created = chatService.createChat({
      modelId,
      ...(body.project ? { projectId: body.project } : {}),
    });
    chatId = created.id;
  } else if (target === 'active') {
    const active = getActiveChatId();
    if (!active) return { ok: false, response: err('No active chat', 409) };
    chatId = active;
  } else {
    const existing = chatService.getChat(target);
    if (!existing) return { ok: false, response: err(`Chat not found: ${target}`, 404) };
    chatId = target;
  }

  return { ok: true, chatId, modelId };
}

export async function handleRequest(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const { pathname } = url;

    // Block non-localhost (belt + suspenders on top of the bind)
    const host = req.headers.get('host') ?? '';
    if (!host.startsWith('127.0.0.1') && !host.startsWith('localhost')) {
      return err('Forbidden', 403);
    }

    // Reject cross-origin requests
    const origin = req.headers.get('origin');
    if (origin && origin !== `http://${host}`) {
      return err('Forbidden', 403);
    }

    // --- POST /pair (unauthenticated) ---
    if (pathname === '/pair' && req.method === 'POST') {
      const body = (await req.json().catch(() => ({}))) as { code?: string; label?: string };
      if (!body.code) return err('Missing code', 400);
      if (!auth.consumePairingCode(body.code)) return err('Invalid or expired code', 401);
      const label = body.label ?? 'Connected Client';
      const token = auth.mintToken(label);
      return json({ token });
    }

    // All other routes require a valid bearer token
    if (!authenticate(req)) return err('Unauthorized', 401);

    // --- GET /chats ---
    if (pathname === '/chats' && req.method === 'GET') {
      return json(chatService.listChats(null));
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
        }));
      return json(allModels);
    }

    // --- POST /prompt ---
    if (pathname === '/prompt' && req.method === 'POST') {
      const body = (await req.json().catch(() => null)) as PromptBody | null;
      const resolved = resolvePromptRequest(body);
      if (!resolved.ok) return resolved.response;
      const { chatId, modelId } = resolved;
      const focus = body?.focus ?? false;

      // 409 for busy-chat queueing is deferred to pre-alpha-2 (roadmap #8).

      const { streamId, assistantMessageId } = startChatStream(
        { chatId, modelId, content: body!.text!, thinking: body?.thinking ?? false },
        {
          onLifecycle: (event, meta) => {
            broadcast({ event, chatId: meta.chatId, streamId: meta.streamId });
          },
        },
      );

      pushControlNavigate({ chatId, streamId, assistantMessageId, focus });
      broadcast({ event: 'accepted', chatId, streamId });

      return json({ chatId, streamId }, 202);
    }

    // --- POST /completions ---  (SSE: streams the response back to the caller)
    if (pathname === '/completions' && req.method === 'POST') {
      const body = (await req.json().catch(() => null)) as PromptBody | null;
      const resolved = resolvePromptRequest(body);
      if (!resolved.ok) return resolved.response;
      const { chatId, modelId } = resolved;

      let closed = false;
      const stream = new ReadableStream({
        start(controller) {
          const enc = new TextEncoder();
          const send = (data: unknown) => {
            if (closed) return;
            try {
              controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
            } catch {
              // Consumer disconnected — stop writing; let the in-app run finish.
              closed = true;
            }
          };

          send({ kind: 'accepted', chatId });

          const { streamId } = startChatStream(
            { chatId, modelId, content: body!.text!, thinking: body?.thinking ?? false },
            {
              onChunk: (chunk) => {
                send(chunk);
                if (chunk.kind === 'done' || chunk.kind === 'error') {
                  closed = true;
                  controller.close();
                }
              },
              onLifecycle: (event, meta) =>
                broadcast({ event, chatId: meta.chatId, streamId: meta.streamId }),
            },
          );

          broadcast({ event: 'accepted', chatId, streamId });
        },
        cancel() {
          // Client went away mid-stream; stop writing. The model run continues in-app.
          closed = true;
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
      });
    }

    return err('Not found', 404);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error('[control-server] Unhandled error', e);
    return err(message, 500);
  }
}
