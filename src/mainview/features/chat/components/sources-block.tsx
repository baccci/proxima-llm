interface Source {
  url: string
  title?: string
}

interface Props {
  sources: Source[]
}

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function SourcesBlock({ sources }: Props) {
  if (sources.length === 0) return null

  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {sources.map((s, i) => (
        <a
          key={i}
          href={s.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-0.5 text-2xs text-subtle hover:text-foreground hover:border-border-strong transition-colors"
        >
          <img
            src={`https://www.google.com/s2/favicons?sz=16&domain=${hostLabel(s.url)}`}
            alt=""
            width={12}
            height={12}
            className="rounded-sm shrink-0"
          />
          <span className="max-w-[120px] truncate">{s.title ?? hostLabel(s.url)}</span>
        </a>
      ))}
    </div>
  )
}
