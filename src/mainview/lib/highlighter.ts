import { createHighlighter, type Highlighter } from 'shiki'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'

// Shiki color theme shared by the highlighter setup and the code-block renderer.
export const SHIKI_THEME = 'one-dark-pro'

// Shiki's built-in no-op grammar, used when a code block's language is unknown.
const FALLBACK_LANG = 'text'

// Map common language aliases to the grammar names Shiki was loaded with.
const LANG_ALIASES: Record<string, string> = {
  ts: 'typescript',
  js: 'javascript',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
}

let promise: Promise<Highlighter> | null = null

export function getHighlighter() {
  if (!promise) {
    promise = createHighlighter({
      themes: [SHIKI_THEME],
      langs: [
        'typescript',
        'tsx',
        'javascript',
        'jsx',
        'json',
        'bash',
        'python',
        'css',
        'html',
        'markdown',
        'sql',
        'rust',
        'go',
      ],
      engine: createJavaScriptRegexEngine(),
    })
  }
  return promise
}

// Highlight a finished code block to a Shiki HTML string. An unknown language falls
// back to plain text so an unrecognized fence never throws.
export async function highlightCode(code: string, lang: string): Promise<string> {
  const hl = await getHighlighter()
  const normalized = LANG_ALIASES[lang] ?? lang
  const resolved = hl.getLoadedLanguages().includes(normalized) ? normalized : FALLBACK_LANG
  return hl.codeToHtml(code, { lang: resolved, theme: SHIKI_THEME })
}
