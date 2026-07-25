import { TOOL_CATALOG } from '@shared/tools/tool-catalog'
import { cn } from '@utils/tailwind-class-merge'
import React from 'react'
import { IconChevronRight } from '@/components/icons/icon-chevron-right'
import { IconTerminal } from '@/components/icons/icon-terminal'
import { getToolSummary } from '../lib/tool-summary'

type ToolCallBlockProps = {
  toolName: string
  input: unknown
  output?: unknown
  awaitingApproval?: boolean
  onApprove?: (remember: boolean) => void
  onDeny?: (remember: boolean) => void
}

export function ToolCallBlock({
  toolName,
  input,
  output,
  awaitingApproval,
  onApprove,
  onDeny,
}: ToolCallBlockProps) {
  const [expanded, setExpanded] = React.useState(false)
  const [remember, setRemember] = React.useState(false)

  const pending = output === undefined && !awaitingApproval
  const phrases = getPhrases(toolName)

  if (awaitingApproval) {
    return (
      <div className="my-2 rounded-card border border-border bg-elevated text-sm overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 bg-panel">
          <span className="text-xs font-mono text-muted">{`Allow ${toolName}?`}</span>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="ml-auto flex items-center gap-1 text-subtle hover:text-foreground transition-colors"
          >
            <IconChevronRight
              width={11}
              className={cn('transition-transform duration-200', expanded && 'rotate-90')}
            />
          </button>
        </div>

        <div
          className={cn(
            'grid transition-[grid-template-rows] duration-200 ease-out overflow-hidden',
            expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
          )}
        >
          <div className="overflow-hidden">
            <div className="px-3 py-2 border-t border-border">
              <p className="text-2xs font-semibold text-subtle uppercase tracking-wider mb-1">
                Input
              </p>
              <pre className="text-xs text-foreground/80 font-mono whitespace-pre-wrap wrap-break-word">
                {JSON.stringify(input, null, 2)}
              </pre>
            </div>
          </div>
        </div>

        <div className="px-3 py-2.5 border-t border-border flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-1.5 text-xs text-subtle cursor-pointer select-none">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="accent-brand"
            />
            Remember this choice
          </label>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={() => onDeny?.(remember)}
              className="px-3 py-1 rounded-md text-xs text-subtle hover:text-foreground border border-border hover:border-border-strong transition-colors"
            >
              Deny
            </button>
            <button
              onClick={() => onApprove?.(remember)}
              className="px-3 py-1 rounded-md text-xs bg-brand text-brand-foreground hover:bg-brand-hover transition-colors"
            >
              Allow
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (pending) {
    return (
      <div className="my-2 text-sm flex items-center gap-1.5">
        <IconTerminal width={12} className="shrink-0 text-subtle" />
        <span className="shimmer-text">{phrases.running}</span>
      </div>
    )
  }

  return (
    <div className="my-2 text-sm">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="group flex items-center gap-1.5 text-subtle hover:text-foreground transition-colors"
      >
        <IconTerminal width={12} className="shrink-0" />
        <span>{phrases.done}</span>
        <IconChevronRight
          width={10}
          className={cn(
            'opacity-0 group-hover:opacity-60 transition-[opacity,transform] duration-150',
            expanded && 'opacity-60 rotate-90',
          )}
        />
      </button>

      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-out overflow-hidden',
          expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="overflow-hidden">
          <div className="mt-1 ml-2 pl-3 border-l border-border py-1">
            <ToolCallDetail toolName={toolName} input={input} output={output} />
          </div>
        </div>
      </div>
    </div>
  )
}

type ToolPhrases = { running: string; done: string }

const PHRASE_MAP = new Map<string, ToolPhrases>(
  TOOL_CATALOG.map((t) => [t.name, { running: t.runningLabel, done: t.doneLabel }]),
)

function getPhrases(toolName: string): ToolPhrases {
  return PHRASE_MAP.get(toolName) ?? { running: `Calling ${toolName}…`, done: toolName }
}

type ToolCallDetailProps = {
  toolName: string
  input: unknown
  output?: unknown
}

// The expanded body of a resolved tool call: a friendly summary when the tool
// has one, otherwise the raw input and output JSON.
function ToolCallDetail({ toolName, input, output }: ToolCallDetailProps) {
  const summary = getToolSummary(toolName, input, output)

  if (!summary) {
    return (
      <div className="space-y-2">
        <div>
          <p className="text-2xs font-semibold text-subtle uppercase tracking-wider mb-1">Input</p>
          <pre className="text-xs text-foreground/80 font-mono whitespace-pre-wrap wrap-break-word">
            {JSON.stringify(input, null, 2)}
          </pre>
        </div>
        {output !== undefined && (
          <div>
            <p className="text-2xs font-semibold text-subtle uppercase tracking-wider mb-1">
              Output
            </p>
            <pre className="text-xs text-foreground/80 font-mono whitespace-pre-wrap wrap-break-word">
              {typeof output === 'string' ? output : JSON.stringify(output, null, 2)}
            </pre>
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <p className="text-xs font-medium text-foreground/80">{summary.heading}</p>
      {summary.preview && (
        <p className="mt-1 text-xs text-foreground/80 line-clamp-3 whitespace-pre-wrap">
          {summary.preview}
        </p>
      )}
    </div>
  )
}
