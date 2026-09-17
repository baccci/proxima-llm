import type { ChatSearchHit } from '@shared/schemas/chat-search.schema'
import { cn } from '@utils/tailwind-class-merge'
import React from 'react'
import { IconSearch } from '@/components/icons/icon-search'
import { IconX } from '@/components/icons/icon-x'
import { Modal, useModalState } from '@/components/modal'
import { Spinner } from '@/components/spinner'
import { SEARCH_MIN_QUERY_LENGTH, SEARCH_MODAL_ID } from '@/features/chat/constants'
import { splitSnippet } from '@/features/chat/helpers/split-snippet'
import { useSearchChats } from '@/features/chat/hooks/use-search-chats'
import { useChatStore } from '@/features/chat/store/chat.store'
import { useProjects } from '@/features/projects/hooks/use-projects'

// Keys that move the selection, mapped to how far they move it.
const MOVE_KEYS: Record<string, number> = {
  ArrowDown: 1,
  ArrowUp: -1,
}

// The chat search palette. Mounted always, but its body mounts only while open, so the
// query and the selection reset every time it is opened rather than being cleared by hand.
export function SearchPalette() {
  // Held here rather than in the body, so the modal can hand focus to the field on open.
  // React's autoFocus would lose the race: useModalBehavior focuses the panel in a mount
  // effect, which runs after the browser has applied autoFocus.
  const inputRef = React.useRef<HTMLInputElement>(null)

  return (
    <Modal
      id={SEARCH_MODAL_ID}
      label="Search chats"
      overlayClassName="items-start pt-[12vh]"
      config={{ focus: { initial: inputRef } }}
    >
      <Modal.Content className="w-full max-w-160 mx-4 rounded-card border border-border bg-panel shadow-modal overflow-hidden">
        <SearchPaletteBody inputRef={inputRef} />
      </Modal.Content>
    </Modal>
  )
}

type SearchPaletteBodyProps = {
  inputRef: React.RefObject<HTMLInputElement>
}

function SearchPaletteBody({ inputRef }: SearchPaletteBodyProps) {
  const { close } = useModalState(SEARCH_MODAL_ID)
  const openChatAtMessage = useChatStore((s) => s.openChatAtMessage)
  const selectedProjectId = useChatStore((s) => s.selectedProjectId)
  const viewingAllChats = useChatStore((s) => s.viewingAllChats)
  const { data: projects = [] } = useProjects()

  // Opening from inside a project scopes the search to it, and the pill below clears
  // that. Seeded once on open, because this body remounts with the modal.
  const [scopeProjectId, setScopeProjectId] = React.useState<string | null>(
    () => viewingAllChats?.projectId ?? selectedProjectId,
  )
  const [query, setQuery] = React.useState('')
  const [activeIndex, setActiveIndex] = React.useState(0)

  const listRef = React.useRef<HTMLUListElement>(null)

  // Defer the query the results are fetched for, so typing stays responsive and fast
  // keystrokes coalesce into fewer round trips without a timer of our own.
  const deferredQuery = React.useDeferredValue(query)
  const { data: hits = [], isFetching } = useSearchChats(deferredQuery, scopeProjectId)

  const scopeProject = projects.find((p) => p.id === scopeProjectId)
  // Clamp rather than reset through an effect: the list shrinks as the query narrows.
  const active = Math.min(activeIndex, Math.max(0, hits.length - 1))

  function openHit(hit: ChatSearchHit) {
    openChatAtMessage(hit.chatId, hit.messageId)
    close()
  }

  function moveSelection(delta: number) {
    if (hits.length === 0) {
      return
    }

    // Wrap around, so holding one arrow key cycles the list.
    const next = (active + delta + hits.length) % hits.length
    setActiveIndex(next)
    listRef.current?.children[next]?.scrollIntoView({ block: 'nearest' })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const delta = MOVE_KEYS[e.key]
    if (delta !== undefined) {
      e.preventDefault()
      moveSelection(delta)
      return
    }

    if (e.key === 'Enter' && hits[active]) {
      openHit(hits[active])
    }
  }

  return (
    <div className="flex flex-col max-h-[70vh]">
      <div className="flex items-center gap-2 px-3 h-12 shrink-0 border-b border-border">
        <IconSearch width={16} className="shrink-0 text-subtle" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActiveIndex(0)
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search chats and messages"
          className="flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder:text-subtle outline-none"
        />
        {isFetching && <Spinner width={14} className="shrink-0 text-subtle" />}
        {scopeProject && (
          <button
            onClick={() => setScopeProjectId(null)}
            className="flex items-center gap-1 shrink-0 pl-2 pr-1.5 h-6 rounded-full bg-surface text-xs text-muted hover:text-foreground transition-colors cursor-pointer"
            title="Search every chat instead"
          >
            <span className="truncate max-w-30">{scopeProject.name}</span>
            <IconX width={11} />
          </button>
        )}
      </div>

      <SearchResults
        hits={hits}
        query={deferredQuery}
        activeIndex={active}
        listRef={listRef}
        onHover={setActiveIndex}
        onPick={openHit}
      />
    </div>
  )
}

type SearchResultsProps = {
  hits: ChatSearchHit[]
  query: string
  activeIndex: number
  listRef: React.RefObject<HTMLUListElement>
  onHover: (index: number) => void
  onPick: (hit: ChatSearchHit) => void
}

function SearchResults({ hits, query, activeIndex, listRef, onHover, onPick }: SearchResultsProps) {
  if (query.trim().length < SEARCH_MIN_QUERY_LENGTH) {
    return (
      <p className="px-4 py-6 text-xs text-subtle text-center">
        Type at least {SEARCH_MIN_QUERY_LENGTH} characters to search titles and messages.
      </p>
    )
  }

  if (hits.length === 0) {
    return <p className="px-4 py-6 text-xs text-subtle text-center">No chats match that.</p>
  }

  return (
    <ul ref={listRef} className="flex-1 min-h-0 overflow-y-auto py-1">
      {hits.map((hit, index) => (
        <SearchResultRow
          key={hit.chatId}
          hit={hit}
          active={index === activeIndex}
          onHover={() => onHover(index)}
          onPick={() => onPick(hit)}
        />
      ))}
    </ul>
  )
}

type SearchResultRowProps = {
  hit: ChatSearchHit
  active: boolean
  onHover: () => void
  onPick: () => void
}

function SearchResultRow({ hit, active, onHover, onPick }: SearchResultRowProps) {
  return (
    <li>
      <button
        onClick={onPick}
        onMouseMove={onHover}
        className={cn(
          'flex flex-col items-start gap-0.5 w-full px-3 py-2 text-left cursor-pointer transition-colors',
          active ? 'bg-surface-hover' : 'hover:bg-surface-hover/60',
        )}
      >
        <span className="w-full text-sm text-foreground truncate">{hit.title}</span>
        <span className="w-full text-xs text-subtle truncate">
          <SnippetText snippet={hit.snippet} />
        </span>
      </button>
    </li>
  )
}

type SnippetTextProps = {
  snippet: string
}

// The matched terms come back wrapped in control characters rather than markup, so each
// run becomes a real element instead of an HTML string.
function SnippetText({ snippet }: SnippetTextProps) {
  return (
    <>
      {splitSnippet(snippet).map((segment, index) => {
        if (!segment.matched) {
          return <span key={index}>{segment.text}</span>
        }

        return (
          <span key={index} className="text-foreground font-medium">
            {segment.text}
          </span>
        )
      })}
    </>
  )
}
