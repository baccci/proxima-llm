import {
  isAlwaysAllowed,
  TOOL_CATALOG,
  TOOL_GROUPS,
  type ToolGroup,
} from '@shared/tools/tool-catalog'
import { SegmentedControl } from '@/components/segmented-control'
import { useSetToolPolicy, useToolPolicies } from '@/features/settings/hooks/use-tool-policies'
import { SectionLabel } from './section-label'

type Policy = 'allow' | 'ask' | 'deny'

const POLICY_OPTIONS: { value: Policy; label: string }[] = [
  { value: 'allow', label: 'Allow' },
  { value: 'ask', label: 'Ask' },
  { value: 'deny', label: 'Deny' },
]

const GROUP_ORDER = Object.keys(TOOL_GROUPS) as ToolGroup[]

export function ToolsSection() {
  const { data: policies = [] } = useToolPolicies()
  const { mutate: setPolicy } = useSetToolPolicy()

  const grouped = GROUP_ORDER.map((group) => ({
    group,
    label: TOOL_GROUPS[group].label,
    tools: TOOL_CATALOG.filter((t) => t.group === group && !isAlwaysAllowed(t.name)),
  })).filter((g) => g.tools.length > 0)

  return (
    <div className="space-y-5">
      <p className="text-xs text-subtle">
        Controls whether each tool runs automatically, requires your approval, or is always blocked
        — across all chats.
      </p>

      {grouped.map(({ group, label, tools }) => (
        <div key={group} className="space-y-3">
          <SectionLabel>{label}</SectionLabel>
          {tools.map((tool) => {
            const current = policies.find((p) => p.name === tool.name)?.policy ?? 'ask'

            return (
              <div key={tool.name} className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{tool.label}</p>
                  <p className="text-xs text-subtle">{tool.description}</p>
                </div>
                <SegmentedControl
                  options={POLICY_OPTIONS}
                  value={current}
                  onChange={(value) => setPolicy({ toolName: tool.name, policy: value })}
                />
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
