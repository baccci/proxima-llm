export const TOOL_CATALOG = [
  {
    name: 'get_capability_detail',
    label: 'Capability lookup',
    description: 'Lets the model fetch detail about an app feature on demand.',
  },
] as const

export type ToolName = (typeof TOOL_CATALOG)[number]['name']
