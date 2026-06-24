import { createHighlighter, type Highlighter } from 'shiki'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'

let promise: Promise<Highlighter> | null = null

export function getHighlighter() {
  if (!promise) {
    promise = createHighlighter({
      themes: ['one-dark-pro'],
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
