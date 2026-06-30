import type { ChatDTO } from '@shared/schemas/chat.schema'
import { cn } from '@utils/tailwind-class-merge'
import React from 'react'
import { Button } from '@/components/button'
import { DialogContent, DialogRoot } from '@/components/dialog'
import {
  DropdownContent,
  DropdownItem,
  DropdownPortal,
  DropdownRoot,
  DropdownSeparator,
  DropdownTrigger,
} from '@/components/dropdown'
import { IconMoreHorizontal } from '@/components/icons/icon-more-horizontal'
import { IconPencil } from '@/components/icons/icon-pencil'
import { IconPin } from '@/components/icons/icon-pin'
import { IconPinOff } from '@/components/icons/icon-pin-off'
import { IconTrash } from '@/components/icons/icon-trash'
import { chat } from '@/features/chat/chat.api'
import { useChatStore } from '@/features/chat/store/chat.store'
import { chatTitle } from '@/features/sidebar/entities/helpers'

interface Props {
  chatItem: ChatDTO
  /** When provided, the Rename item calls this instead of opening a dialog (sidebar inline-edit). */
  onRenameClick?: () => void
  /** Notified when the dropdown opens/closes (e.g. to keep row highlighted). */
  onOpenChange?: (open: boolean) => void
  triggerClassName?: string
  triggerSize?: number
}

export function ChatActionsMenu({
  chatItem,
  onRenameClick,
  onOpenChange,
  triggerClassName,
  triggerSize = 14,
}: Props) {
  const selectChat = useChatStore((s) => s.selectChat)
  const selectedChatId = useChatStore((s) => s.selectedChatId)
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [renamingDialog, setRenamingDialog] = React.useState(false)
  const [renameText, setRenameText] = React.useState('')
  const renameInputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (renamingDialog) {
      setRenameText(chatTitle(chatItem))
      requestAnimationFrame(() => renameInputRef.current?.select())
    }
  }, [renamingDialog, chatItem])

  async function handleTogglePin() {
    await chat.update({ id: chatItem.id, pinned: !chatItem.pinned })
  }

  function handleRenameClick() {
    if (onRenameClick) {
      onRenameClick()
    } else {
      setRenamingDialog(true)
    }
  }

  async function commitRenameDialog() {
    const trimmed = renameText.trim()
    if (trimmed && trimmed !== chatTitle(chatItem)) {
      await chat.update({ id: chatItem.id, title: trimmed })
    }
    setRenamingDialog(false)
  }

  function handleRenameKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitRenameDialog()
    } else if (e.key === 'Escape') setRenamingDialog(false)
  }

  async function executeDelete() {
    setConfirmDelete(false)
    await chat.remove(chatItem.id)
    if (selectedChatId === chatItem.id) selectChat(null)
  }

  return (
    <>
      <DropdownRoot onOpenChange={onOpenChange}>
        <DropdownTrigger
          className={cn(
            'flex items-center justify-center w-6 h-6 rounded-md text-subtle hover:bg-border hover:text-foreground transition-colors cursor-pointer',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            triggerClassName,
          )}
          aria-label="Chat options"
        >
          <IconMoreHorizontal width={triggerSize} />
        </DropdownTrigger>
        <DropdownPortal>
          <DropdownContent side="bottom" align="end">
            <DropdownItem
              icon={chatItem.pinned ? <IconPinOff width={14} /> : <IconPin width={14} />}
              onClick={handleTogglePin}
            >
              {chatItem.pinned ? 'Unpin' : 'Pin'}
            </DropdownItem>
            <DropdownItem icon={<IconPencil width={14} />} onClick={handleRenameClick}>
              Rename
            </DropdownItem>
            <DropdownSeparator />
            <DropdownItem
              danger
              icon={<IconTrash width={14} />}
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </DropdownItem>
          </DropdownContent>
        </DropdownPortal>
      </DropdownRoot>

      {/* Rename dialog — used when no inline-rename callback is provided (e.g. chat header) */}
      {!onRenameClick && (
        <DialogRoot open={renamingDialog} onOpenChange={setRenamingDialog}>
          <DialogContent title="Rename chat">
            <input
              ref={renameInputRef}
              value={renameText}
              onChange={(e) => setRenameText(e.target.value)}
              onKeyDown={handleRenameKeyDown}
              className="w-full px-3 py-2 text-sm rounded-lg bg-surface-hover text-foreground outline-none border border-border focus:border-brand mb-4"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRenamingDialog(false)}>
                Cancel
              </Button>
              <Button variant="brand" onClick={commitRenameDialog}>
                Save
              </Button>
            </div>
          </DialogContent>
        </DialogRoot>
      )}

      {/* Delete confirm dialog */}
      <DialogRoot open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent
          title="Delete chat?"
          description={`"${chatTitle(chatItem)}" will be permanently deleted. This cannot be undone.`}
        >
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={executeDelete}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </DialogRoot>
    </>
  )
}
