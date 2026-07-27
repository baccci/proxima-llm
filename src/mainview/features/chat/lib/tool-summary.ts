type ToolSummary = {
  heading: string
  preview?: string
}

function asString(v: unknown): string | undefined {
  if (typeof v === 'string') {
    return v
  }
  return undefined
}

function asObj(v: unknown): Record<string, unknown> | undefined {
  if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
    return v as Record<string, unknown>
  }
  return undefined
}

export function getToolSummary(
  toolName: string,
  input: unknown,
  output: unknown,
): ToolSummary | null {
  const inp = asObj(input) ?? {}
  const out = asObj(output)

  switch (toolName) {
    case 'read_memory': {
      const scope = inp.scope === 'global' ? 'Global' : 'Project'
      const preview = out ? (asString(out.content) ?? asString(out.error)) : undefined
      return { heading: `${scope} memory`, preview }
    }
    case 'write_memory': {
      const scope = inp.scope === 'global' ? 'global' : 'project'
      const title = asString(inp.title) ?? ''
      return { heading: `Saved ${scope} memory: ${title}`, preview: asString(inp.content) }
    }
    case 'delete_memory': {
      const scope = inp.scope === 'global' ? 'global' : 'project'
      const title = asString(inp.title) ?? ''
      // A gate-blocked delete returns { blocked: true } and never ran, so it must
      // not read as "Deleted". Name the slice that was targeted but not removed.
      if (out?.blocked) {
        return { heading: `Blocked: delete ${scope} memory: ${title}` }
      }
      return { heading: `Deleted ${scope} memory: ${title}` }
    }
    case 'read_project_file': {
      const name = asString(inp.name) ?? ''
      const preview = out ? asString(out.content) : undefined
      return { heading: `Read file: ${name}`, preview }
    }
    case 'get_capability_detail': {
      const capability = asString(inp.capability) ?? ''
      const preview = asString(output)
      return { heading: `Looked up: ${capability}`, preview }
    }
    default:
      return null
  }
}
