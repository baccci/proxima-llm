import type { ToolPolicy } from './tool-policy'

export const TOOL_GROUPS = {
  memory: { label: 'Memory' },
  files: { label: 'Files' },
  app: { label: 'App' },
} as const

export type ToolGroup = keyof typeof TOOL_GROUPS

type ToolCatalogEntry = {
  name: string
  label: string
  runningLabel: string
  doneLabel: string
  description: string
  group: ToolGroup
  defaultPolicy: ToolPolicy
  alwaysAllow?: boolean
  silent?: boolean
}

export const TOOL_CATALOG = [
  {
    name: 'read_memory',
    label: 'Read memory',
    runningLabel: 'Reading memory…',
    doneLabel: 'Read memory',
    description: 'Lets the model read a saved memory slice by title.',
    group: 'memory',
    defaultPolicy: 'allow',
    alwaysAllow: true,
    silent: true,
  },
  {
    name: 'write_memory',
    label: 'Write memory',
    runningLabel: 'Writing memory…',
    doneLabel: 'Wrote memory',
    description: 'Lets the model save or update a memory slice.',
    group: 'memory',
    defaultPolicy: 'allow',
  },
  {
    name: 'delete_memory',
    label: 'Delete memory',
    runningLabel: 'Deleting memory…',
    doneLabel: 'Deleted memory',
    description: 'Lets the model delete a memory slice.',
    group: 'memory',
    defaultPolicy: 'ask',
  },
  {
    name: 'read_project_file',
    label: 'Read project file',
    runningLabel: 'Reading file…',
    doneLabel: 'Read file',
    description: 'Lets the model read a project file by name.',
    group: 'files',
    defaultPolicy: 'allow',
    alwaysAllow: true,
  },
  {
    name: 'get_capability_detail',
    label: 'Capability lookup',
    runningLabel: 'Checking capabilities…',
    doneLabel: 'Checked capabilities',
    description: 'Lets the model fetch detail about an app feature on demand.',
    group: 'app',
    defaultPolicy: 'allow',
    alwaysAllow: true,
    silent: true,
  },
] as const satisfies readonly ToolCatalogEntry[]

export type ToolName = (typeof TOOL_CATALOG)[number]['name']

const META: Map<string, ToolCatalogEntry> = new Map(TOOL_CATALOG.map((t) => [t.name, t]))
export const isAlwaysAllowed = (n: string) => META.get(n)?.alwaysAllow ?? false
export const isSilentTool = (n: string) => META.get(n)?.silent ?? false
export const defaultPolicyFor = (n: string): ToolPolicy => META.get(n)?.defaultPolicy ?? 'ask'

// alwaysAllow tools bypass the gate, so their defaultPolicy is never consulted. Require it to
// read 'allow' so the metadata matches the real behavior, not a misleading 'ask' that never fires.
for (const t of META.values()) {
  if (t.alwaysAllow && t.defaultPolicy !== 'allow') {
    throw new Error(
      `tool-catalog: ${t.name} is alwaysAllow but defaultPolicy is '${t.defaultPolicy}'`,
    )
  }
}
