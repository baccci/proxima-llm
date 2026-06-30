import React from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { getHighlighter } from '@/lib/highlighter'

const LANG_ALIASES: Record<string, string> = {
  ts: 'typescript',
  js: 'javascript',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
}

// ---------------------------------------------------------------------------
// Code block — plain monospace during streaming; Shiki-highlighted once done
// ---------------------------------------------------------------------------

interface CodeBlockProps {
  lang: string
  filename?: string
  code: string
  streaming?: boolean
}

const CodeBlock = React.memo(function CodeBlock({
  lang,
  filename,
  code,
  streaming,
}: CodeBlockProps) {
  const [html, setHtml] = React.useState<string | null>(null)
  const [copied, setCopied] = React.useState(false)

  // WebKit doesn't recompute this scroll container's horizontal scrollbar when the
  // Shiki <pre> is injected via dangerouslySetInnerHTML (the fallback <pre> works
  // because its child is a React text node, not injected HTML). Flush layout and
  // force one extra render on mount so WebKit repaints the scrollbar.
  const [, forcePaint] = React.useReducer((n: number) => n + 1, 0)
  const forceScrollbarPaint = React.useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    requestAnimationFrame(() => {
      void el.scrollWidth
      forcePaint()
    })
  }, [])

  React.useEffect(() => {
    if (streaming) return
    let cancelled = false
    getHighlighter()
      .then((hl) => {
        if (cancelled) return
        const normalized = LANG_ALIASES[lang] ?? lang
        const resolved = hl.getLoadedLanguages().includes(normalized) ? normalized : 'text'
        return hl.codeToHtml(code, { lang: resolved, theme: 'one-dark-pro' })
      })
      .then((h) => {
        if (!cancelled && h) setHtml(h)
      })
      .catch(() => {
        /* fall back to plain */
      })
    return () => {
      cancelled = true
    }
  }, [code, lang, streaming])

  function handleCopy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="my-3 rounded-card overflow-hidden border border-code-border bg-code text-sm">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-code-border bg-code-header">
        {lang && <span className="text-xs text-neutral-400 font-mono">{lang}</span>}
        {filename && <span className="text-xs text-neutral-500 font-mono">{filename}</span>}
        <button
          onClick={handleCopy}
          className="ml-auto text-xs text-neutral-400 hover:text-neutral-50 transition-colors"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      {html && !streaming ? (
        <div
          ref={forceScrollbarPaint}
          className="code-scroll overflow-x-auto [&>pre]:p-4 [&>pre]:m-0 [&>pre]:bg-transparent!"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="code-scroll p-4 overflow-x-auto font-mono text-sm text-neutral-200 whitespace-pre">
          {code}
        </pre>
      )}
    </div>
  )
})

// ---------------------------------------------------------------------------
// Static component overrides — hoisted so they have stable identities across
// Markdown re-renders. These close over nothing and never need to change.
// ---------------------------------------------------------------------------

const STATIC_COMPONENTS: Partial<Components> = {
  code({ className, children }) {
    return (
      <code
        className={`font-mono text-selected-foreground bg-selected-surface px-1 py-0.5 rounded text-[0.85em] ${className ?? ''}`}
      >
        {children}
      </code>
    )
  },
  p({ children }) {
    return <p className="mb-3 last:mb-0 leading-relaxed overflow-x-auto">{children}</p>
  },
  a({ href, children }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="text-selected-foreground underline underline-offset-2 hover:opacity-80 transition-opacity"
      >
        {children}
      </a>
    )
  },
  ul({ children }) {
    return <ul className="mb-3 ml-4 list-disc space-y-1">{children}</ul>
  },
  ol({ children }) {
    return <ol className="mb-3 ml-4 list-decimal space-y-1">{children}</ol>
  },
  blockquote({ children }) {
    return (
      <blockquote className="my-3 border-l-2 border-border-strong pl-4 text-muted italic">
        {children}
      </blockquote>
    )
  },
  h1({ children }) {
    return <h1 className="text-xl font-bold mb-3 mt-4 first:mt-0">{children}</h1>
  },
  h2({ children }) {
    return <h2 className="text-md font-semibold mb-2 mt-4 first:mt-0">{children}</h2>
  },
  h3({ children }) {
    return <h3 className="text-base font-semibold mb-2 mt-3 first:mt-0">{children}</h3>
  },
  table({ children }) {
    return (
      <div className="my-3 overflow-x-auto">
        <table className="w-full text-sm border-collapse border border-border">{children}</table>
      </div>
    )
  },
  th({ children }) {
    return (
      <th className="border border-border bg-surface px-3 py-1.5 text-left font-semibold text-xs text-muted uppercase tracking-wide">
        {children}
      </th>
    )
  },
  td({ children }) {
    return <td className="border border-border px-3 py-1.5">{children}</td>
  },
}

// `pre` is the only override that depends on render state (streaming → forwarded to CodeBlock).
function makePre(streaming: boolean | undefined): Components['pre'] {
  return function Pre({ children }) {
    // Extract code node from pre > code.
    // NB: react-markdown maps the <code> node to our `code` override, so the
    // child's `type` is that function component — never the string 'code'.
    // Gate on isValidElement and read props directly; a `pre` only ever wraps a code block.
    const child = React.Children.toArray(children)[0] as React.ReactElement<{
      className?: string
      children?: string
    }>
    if (!React.isValidElement(child)) {
      return <pre className="my-3 overflow-x-auto whitespace-pre">{children}</pre>
    }
    const langClass = child.props.className ?? ''
    const lang = langClass.replace('language-', '')
    const code = String(child.props.children ?? '').trimEnd()
    return <CodeBlock lang={lang} code={code} streaming={streaming} />
  }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface MarkdownProps {
  content: string
  streaming?: boolean
  className?: string
}

export const Markdown = React.memo(function Markdown({
  content,
  streaming,
  className,
}: MarkdownProps) {
  const components = React.useMemo(
    () => ({ ...STATIC_COMPONENTS, pre: makePre(streaming) }),
    [streaming],
  )

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} className={className} components={components}>
      {content}
    </ReactMarkdown>
  )
})
