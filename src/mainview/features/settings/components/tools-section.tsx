import { TOOL_CATALOG } from '@shared/tools/tool-catalog'
import { cn } from '@utils/tailwind-class-merge'
import { useSetToolPolicy, useToolPolicies } from '@/features/settings/hooks/use-tool-policies'

type Policy = 'allow' | 'ask' | 'deny'

const POLICY_OPTIONS: { value: Policy; label: string }[] = [
  { value: 'allow', label: 'Allow' },
  { value: 'ask', label: 'Ask' },
  { value: 'deny', label: 'Deny' },
]

export function ToolsSection() {
  const { data: policies = [] } = useToolPolicies()
  const { mutate: setPolicy } = useSetToolPolicy()

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-subtle">
          Controls whether each tool runs automatically, requires your approval, or is always
          blocked — across all chats.
        </p>
      </div>

      {TOOL_CATALOG.map((tool) => {
        const current = policies.find((p) => p.name === tool.name)?.policy ?? 'ask'

        return (
          <div key={tool.name}>
            <div className="mb-2">
              <p className="text-sm font-medium text-foreground">{tool.label}</p>
              <p className="text-xs text-subtle">{tool.description}</p>
            </div>
            <div className="flex gap-2">
              {POLICY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setPolicy({ toolName: tool.name, policy: opt.value })}
                  className={cn(
                    'flex-1 py-2 rounded-lg border text-sm transition-colors cursor-pointer',
                    current === opt.value
                      ? 'border-brand bg-brand/10 text-brand'
                      : 'border-border text-muted hover:bg-surface-hover hover:text-foreground',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
