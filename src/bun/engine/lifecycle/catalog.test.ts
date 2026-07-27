import { describe, expect, it, mock } from 'bun:test'
import { HOOK_ACTION_ID } from '../../../shared-contracts/lifecycle/hook-catalog'
import type { ApprovalNeededContext, TurnDoneContext, TurnErrorContext } from './action'
import { CATALOG } from './catalog'

function turnDoneCtx(overrides: Partial<TurnDoneContext>): TurnDoneContext {
  return {
    chatId: 'c1',
    chatTitle: 'A chat',
    isWindowFocused: () => false,
    showNotification: mock(),
    playSound: mock(),
    ...overrides,
  }
}

describe('completion-sound action', () => {
  it('plays the completion sound when the window is unfocused', async () => {
    const playSound = mock()
    await CATALOG.get(HOOK_ACTION_ID.completionSound)?.run(
      turnDoneCtx({ isWindowFocused: () => false, playSound }),
    )
    expect(playSound).toHaveBeenCalledWith('completion')
  })

  it('plays even when the window is focused', async () => {
    const playSound = mock()
    await CATALOG.get(HOOK_ACTION_ID.completionSound)?.run(
      turnDoneCtx({ isWindowFocused: () => true, playSound }),
    )
    expect(playSound).toHaveBeenCalledWith('completion')
  })
})

describe('completion-notification action', () => {
  it('shows a silent notification titled with the chat when unfocused', async () => {
    const showNotification = mock()
    await CATALOG.get(HOOK_ACTION_ID.completionNotification)?.run(
      turnDoneCtx({ isWindowFocused: () => false, chatTitle: 'My chat', showNotification }),
    )
    expect(showNotification).toHaveBeenCalledWith({
      title: 'My chat',
      body: 'Your reply is ready.',
    })
  })

  it('shows nothing when focused', async () => {
    const showNotification = mock()
    await CATALOG.get(HOOK_ACTION_ID.completionNotification)?.run(
      turnDoneCtx({ isWindowFocused: () => true, showNotification }),
    )
    expect(showNotification).not.toHaveBeenCalled()
  })
})

describe('error-sound action', () => {
  it('plays the error sound regardless of focus', async () => {
    const playSound = mock()
    const ctx: TurnErrorContext = { chatId: 'c1', playSound }
    await CATALOG.get(HOOK_ACTION_ID.errorSound)?.run(ctx)
    expect(playSound).toHaveBeenCalledWith('error')
  })
})

describe('approval-sound action', () => {
  it('plays the approval sound regardless of focus', async () => {
    const playSound = mock()
    const ctx: ApprovalNeededContext = { chatId: 'c1', playSound }
    await CATALOG.get(HOOK_ACTION_ID.approvalSound)?.run(ctx)
    expect(playSound).toHaveBeenCalledWith('approval')
  })
})
