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
    <div className="my-3 rounded-card overflow-hidden border border-border bg-elevated text-sm">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-panel">
        {lang && <span className="text-xs text-muted font-mono">{lang}</span>}
        {filename && <span className="text-xs text-subtle font-mono">{filename}</span>}
        <button
          onClick={handleCopy}
          className="ml-auto text-xs text-subtle hover:text-foreground transition-colors"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      {html && !streaming ? (
        <div
          className="[&>pre]:p-4 [&>pre]:overflow-x-auto [&>pre]:m-0 [&>pre]:bg-transparent!"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="p-4 overflow-x-auto font-mono text-sm text-foreground/90 whitespace-pre">
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
        className={`font-mono text-accent-400 bg-elevated px-1 py-0.5 rounded text-sm ${className ?? ''}`}
      >
        {children}
      </code>
    )
  },
  p({ children }) {
    return <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>
  },
  a({ href, children }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="text-brand underline underline-offset-2 hover:text-brand-hover"
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
    return <h1 className="text-lg font-bold mb-3 mt-4 first:mt-0">{children}</h1>
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
      return <pre>{children}</pre>
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
