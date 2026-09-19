import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import './global.css'
import { App } from './app/app'
import { onControlNavigate } from './app/on-control-navigate'
import { ErrorBoundary } from './components/error-boundary'
import { initActiveChatReporter } from './features/chat/lib/active-chat-reporter'
import { initStreamResetOnNavigation } from './features/chat/lib/reset-stream-on-navigation'
import { initFindResetOnNavigation } from './features/chat-find/lib/reset-find-on-navigation'
import { installClientLogger } from './lib/client-logger'
import { electroview, subscribeToControlNavigate } from './lib/rpc.client'

installClientLogger()
initActiveChatReporter()
initStreamResetOnNavigation()
initFindResetOnNavigation()
subscribeToControlNavigate(onControlNavigate)

document.addEventListener(
  'keydown',
  (e) => {
    if (e.metaKey && e.key === 'q') {
      e.preventDefault()
      electroview.rpc?.request.quit({})
    }
  },
  { capture: true },
)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
