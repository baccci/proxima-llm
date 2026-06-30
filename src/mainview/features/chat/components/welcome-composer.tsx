import React from 'react'
import { Logo } from '@/components/logo'
import { ComposerBody } from './composer-body'

const GREETINGS = [
  "What's on your mind?",
  "Let's think together.",
  'Ask me anything.',
  'How can I help today?',
  'What are we building?',
  'Ready when you are.',
]

function pickGreeting() {
  return GREETINGS[Math.floor(Math.random() * GREETINGS.length)]
}

export function WelcomeComposer() {
  const [greeting] = React.useState(pickGreeting)

  return (
    <main className="flex flex-col flex-1 h-full overflow-hidden items-center justify-center z-base">
      <div className="w-full h-full max-w-(--layout-content-w) px-6 flex flex-col items-center gap-5">
        <div className="flex flex-col items-center gap-3 mt-auto">
          <Logo width={40} className="text-accent-500 dark:text-foreground shrink-0 mt-20" />
          <h1 className="text-2xl font-semibold text-foreground tracking-tighter">{greeting}</h1>
        </div>
        <ComposerBody projectId={null} className="mt-auto" />
      </div>
    </main>
  )
}
