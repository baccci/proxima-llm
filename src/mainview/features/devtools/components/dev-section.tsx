import { cn } from '@utils/tailwind-class-merge'
import type React from 'react'
import { CollapsiblePanel, CollapsibleRoot, CollapsibleTrigger } from '@/components/collapsible'

interface DevSectionProps {
  title: string
  children: React.ReactNode
  className?: string
}

export function DevSection({ title, children, className }: DevSectionProps) {
  return (
    <CollapsibleRoot className={cn('border-b border-white/10 last:border-0', className)}>
      <CollapsibleTrigger className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/40">
        {title}
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <div className="px-3 pb-3">{children}</div>
      </CollapsiblePanel>
    </CollapsibleRoot>
  )
}
