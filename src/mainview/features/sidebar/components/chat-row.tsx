import type { ChatDTO } from '@shared/schemas/chat.schema'
import { cn } from '@utils/tailwind-class-merge'
import React from 'react'
import { IconPin } from '@/components/icons/icon-pin'
import { chat } from '@/features/chat/chat.api'
import { ChatActionsMenu } from '@/features/chat/components/chat-actions-menu'
import { chatTitle } from '@/features/chat/entities/chat-title'
import { useMountEffect } from '@/hooks/use-mount-effect'

type ChatRowProps = {
  chatItem: ChatDTO
  selected: boolean
  onSelect: () => void
  pinned?: boolean
}

export function ChatRow({ chatItem, selected, onSelect, pinned }: ChatRowProps) {
  const [editing, setEditing] = React.useState(false)
  const [menuOpen, setMenuOpen] = React.useState(false)

  // Mounted only while editing, so the rename input seeds its draft on mount and
  // tears down on cancel or commit without an effect to sync it.
  if (editing) {
    return <ChatRowRename chatItem={chatItem} onDone={() => setEditing(false)} />
  }

  return (
    <li className="relative group">
      <button
        onClick={onSelect}
        className={cn(
          'flex items-center w-full mb-0.5 pl-2 pr-1 h-8 text-sm rounded-lg transition-colors cursor-pointer text-left',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:bg-surface-hover focus-visible:text-foreground',
          selected && 'bg-surface-hover text-foreground',
          !selected && 'text-muted group-hover:bg-surface-hover group-hover:text-foreground',
        )}
      >
        {pinned && <IconPin width={13} className="text-subtle shrink-0 mr-2" />}
        <span
          className="relative flex-1 min-w-0 overflow-hidden pr-9 whitespace-nowrap"
          style={{ maskImage: 'linear-gradient(to right, black 70%, transparent 90%)' }}
        >
          {chatTitle(chatItem)}
        </span>
      </button>

      {/* ⋯ trigger — sibling to button, revealed on hover or while menu open */}
      <div
        className={cn(
          'absolute right-1 top-1/2 -translate-y-1/2 transition-opacity',
          menuOpen && 'opacity-100',
          !menuOpen && 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
        )}
      >
        <ChatActionsMenu
          chatItem={chatItem}
          onRenameClick={() => setEditing(true)}
          onOpenChange={setMenuOpen}
        />
      </div>
    </li>
  )
}

type ChatRowRenameProps = {
  chatItem: ChatDTO
  onDone: () => void
}

function ChatRowRename({ chatItem, onDone }: ChatRowRenameProps) {
  const [renameText, setRenameText] = React.useState(() => chatTitle(chatItem))
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Select the current title on mount so the user can type straight over it.
  useMountEffect(() => {
    requestAnimationFrame(() => {
      inputRef.current?.select()
    })
  })

  async function commitRename() {
    const trimmed = renameText.trim()
    if (trimmed && trimmed !== chatTitle(chatItem)) {
      await chat.update({ id: chatItem.id, title: trimmed })
    }
    onDone()
  }

  function handleRenameKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitRename()
      return
    }
    if (e.key === 'Escape') {
      onDone()
    }
  }

  return (
    <li>
      <input
        ref={inputRef}
        value={renameText}
        onChange={(e) => setRenameText(e.target.value)}
        onKeyDown={handleRenameKeyDown}
        onBlur={commitRename}
        className="w-full px-2 h-8 text-sm rounded-lg bg-surface-hover text-foreground outline-none border border-selected-border"
      />
    </li>
  )
}
