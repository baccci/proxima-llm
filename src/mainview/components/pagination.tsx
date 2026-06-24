import { cn } from '@utils/tailwind-class-merge'

type Props = {
  page: number
  pageCount: number
  onChange: (page: number) => void
}

function buildPages(page: number, pageCount: number): (number | '…')[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1)
  const pages: (number | '…')[] = [1]
  if (page > 3) pages.push('…')
  for (let i = Math.max(2, page - 1); i <= Math.min(pageCount - 1, page + 1); i++) {
    pages.push(i)
  }
  if (page < pageCount - 2) pages.push('…')
  pages.push(pageCount)
  return pages
}

export function Pagination({ page, pageCount, onChange }: Props) {
  if (pageCount <= 1) return null
  const items = buildPages(page, pageCount)
  return (
    <div className="flex items-center justify-center gap-1">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className="px-2 py-1 rounded text-sm text-muted hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
      >
        Prev
      </button>
      {items.map((item, i) =>
        item === '…' ? (
          <span key={`ellipsis-${i}`} className="px-1 text-sm text-subtle select-none">
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            onClick={() => onChange(item)}
            className={cn(
              'w-7 h-7 rounded text-sm transition-colors cursor-pointer',
              item === page
                ? 'bg-surface-hover text-foreground font-medium'
                : 'text-muted hover:bg-surface-hover hover:text-foreground',
            )}
          >
            {item}
          </button>
        ),
      )}
      <button
        type="button"
        disabled={page >= pageCount}
        onClick={() => onChange(page + 1)}
        className="px-2 py-1 rounded text-sm text-muted hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
      >
        Next
      </button>
    </div>
  )
}
