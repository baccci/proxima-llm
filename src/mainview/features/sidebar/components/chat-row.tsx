import type { ChatDTO } from '@shared/schemas/chat.schema'
import { cn } from '@utils/tailwind-class-merge'
import React from 'react'
import { IconPin } from '@/components/icons/icon-pin'
import { chat } from '@/features/chat/chat.api'
import { ChatActionsMenu } from '@/features/chat/components/chat-actions-menu'
import { chatTitle } from '@/features/sidebar/entities/helpers'

interface Props {
  chatItem: ChatDTO
  selected: boolean
  onSelect: () => void
  pinned?: boolean
}

export function ChatRow({ chatItem, selected, onSelect, pinned }: Props) {
  const [editing, setEditing] = React.useState(false)
  const [renameText, setRenameText] = React.useState('')
  const [menuOpen, setMenuOpen] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (editing) {
      setRenameText(chatTitle(chatItem))
      requestAnimationFrame(() => {
        inputRef.current?.select()
      })
    }
  }, [editing, chatItem])

  async function commitRename() {
    const trimmed = renameText.trim()
    if (trimmed && trimmed !== chatTitle(chatItem)) {
      await chat.update({ id: chatItem.id, title: trimmed })
    }
    setEditing(false)
  }

  function handleRenameKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitRename()
    } else if (e.key === 'Escape') {
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <li>
        <input
          ref={inputRef}
          value={renameText}
          onChange={(e) => setRenameText(e.target.value)}
          onKeyDown={handleRenameKeyDown}
          onBlur={commitRename}
          className="w-full mx-1 px-3 py-1.5 text-sm rounded-lg bg-surface-hover text-foreground outline-none border border-brand"
          style={{ width: 'calc(100% - 8px)' }}
        />
      </li>
    )
  }

  return (
    <li className="relative group">
      <button
        onClick={onSelect}
        className={cn(
          'flex items-center w-full ml-1 mb-0.5 p-1.5 text-sm rounded-lg transition-colors cursor-pointer text-left',
          selected
            ? 'bg-surface-hover text-foreground'
            : 'text-muted group-hover:bg-surface-hover group-hover:text-foreground',
        )}
        style={{ width: 'calc(100% - 8px)' }}
      >
        {pinned && <IconPin width={13} className="text-subtle shrink-0 mr-2" />}
        <span
          className="relative flex-1 min-w-0 overflow-hidden pr-5 whitespace-nowrap"
          style={{ maskImage: 'linear-gradient(to right, black 75%, transparent 95%)' }}
        >
          {chatTitle(chatItem)}
        </span>
      </button>

      {/* ⋯ trigger — sibling to button, revealed on hover or while menu open */}
      <div
        className={cn(
          'absolute right-2 top-1/2 -translate-y-1/2 transition-opacity',
          menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
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
