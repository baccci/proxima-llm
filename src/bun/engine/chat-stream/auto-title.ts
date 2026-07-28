import * as chatService from '../../features/chat/chat.repository'
import { generateChatTitle } from '../../features/model/title'
import { resolveTitleModel } from '../../features/model/title-model.service'
import type { AutoTitleContext } from '../lifecycle/action'
import { runResilientStep } from '../lifecycle/resilient-step'
import { LIFECYCLE_STAGE } from '../lifecycle/stages'
import { resolveAutoTitle } from './resolve-auto-title'

// Auto-name a chat while it still has the default title. Idempotent (resolveAutoTitle owns
// the guard and picks the title source, the first user message), so it can run every turn
// and a title that failed earlier self-heals later. Cheap title model is primary, the chat's
// own live model is the fallback, under the uniform resilient-step policy.
export async function runAutoTitle(ctx: AutoTitleContext): Promise<void> {
  const chat = chatService.getChat(ctx.chatId)
  const history = chatService.listMessages(ctx.chatId)
  const source = resolveAutoTitle(chat, history)
  if (!source) {
    return
  }

  const title = await runResilientStep({
    stage: LIFECYCLE_STAGE.autoTitle,
    primaryModelId: resolveTitleModel(ctx.model.provider),
    fallbackModelId: ctx.model.id,
    run: (modelId) => generateChatTitle(source, ctx.model.provider, ctx.apiKey, modelId),
  })
  if (title) {
    chatService.updateChat(ctx.chatId, { title })
    ctx.notifyChatsUpdated()
  }
}
