import React from 'react'
import ReactDOM from 'react-dom/client'
import './global.css'
import { App } from './app/app'
import { initActiveChatReporter } from './features/chat/lib/active-chat-reporter'
import { electroview } from './lib/rpc.client'

initActiveChatReporter()

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
    <App />
  </React.StrictMode>,
)
