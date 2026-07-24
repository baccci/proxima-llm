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
import { chatTitle } from '@/features/chat/entities/chat-title'
import { useChatStore } from '@/features/chat/store/chat.store'
import { useMountEffect } from '@/hooks/use-mount-effect'

type ChatActionsMenuProps = {
  chatItem: ChatDTO
  /** When provided, the Rename item calls this instead of opening a dialog (sidebar inline-edit). */
  onRenameClick?: () => void
  /** Notified when the dropdown opens/closes (e.g. to keep row highlighted). */
  onOpenChange?: (open: boolean) => void
  triggerClassName?: string
  triggerSize?: number
}

type RenameDialogFormProps = {
  chatItem: ChatDTO
  onClose: () => void
}

// The rename form, mounted only while the dialog is open (base-ui unmounts the
// popup on close), so it seeds fresh from the chat each time and selects on mount.
function RenameDialogForm({ chatItem, onClose }: RenameDialogFormProps) {
  const [text, setText] = React.useState(() => chatTitle(chatItem))
  const inputRef = React.useRef<HTMLInputElement>(null)

  useMountEffect(() => {
    requestAnimationFrame(() => inputRef.current?.select())
  })

  async function commit() {
    const trimmed = text.trim()
    if (trimmed && trimmed !== chatTitle(chatItem)) {
      await chat.update({ id: chatItem.id, title: trimmed })
    }
    onClose()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit()
      return
    }

    if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-full px-3 py-2 text-sm rounded-lg bg-surface-hover text-foreground outline-none border border-border focus:border-brand mb-4"
      />
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="brand" onClick={commit}>
          Save
        </Button>
      </div>
    </>
  )
}

export function ChatActionsMenu({
  chatItem,
  onRenameClick,
  onOpenChange,
  triggerClassName,
  triggerSize = 14,
}: ChatActionsMenuProps) {
  const selectChat = useChatStore((s) => s.selectChat)
  const selectedChatId = useChatStore((s) => s.selectedChatId)
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [renamingDialog, setRenamingDialog] = React.useState(false)

  async function handleTogglePin() {
    await chat.update({ id: chatItem.id, pinned: !chatItem.pinned })
  }

  function handleRenameClick() {
    if (onRenameClick) {
      onRenameClick()
      return
    }
    setRenamingDialog(true)
  }

  async function executeDelete() {
    setConfirmDelete(false)
    await chat.remove(chatItem.id)
    if (selectedChatId === chatItem.id) {
      selectChat(null)
    }
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

      {/* Rename dialog, used when no inline-rename callback is provided (e.g. chat header) */}
      {!onRenameClick && (
        <DialogRoot open={renamingDialog} onOpenChange={setRenamingDialog}>
          <DialogContent title="Rename chat">
            <RenameDialogForm chatItem={chatItem} onClose={() => setRenamingDialog(false)} />
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
