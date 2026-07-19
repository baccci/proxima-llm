import { createHighlighter, type Highlighter } from 'shiki'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'

// Shiki color theme shared by the highlighter setup and the code-block renderer.
export const SHIKI_THEME = 'one-dark-pro'

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
