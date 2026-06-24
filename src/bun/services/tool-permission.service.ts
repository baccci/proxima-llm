import { eq } from 'drizzle-orm';
import { TOOL_CATALOG } from '../../shared-contracts/tools/tool-catalog';
import { db } from '../db/client';
import { settings } from '../db/schema';
import { BUILTIN_TOOLS, type ToolRegistryEntry } from '../llm/tools/registry';

type Policy = 'allow' | 'ask' | 'deny';
type PolicyMap = Record<string, Policy>;

const KEY = 'tool_policies';

function load(): PolicyMap {
  const row = db.select().from(settings).where(eq(settings.key, KEY)).get();
  return row ? (row.value as PolicyMap) : {};
}

function save(map: PolicyMap): void {
  db.insert(settings)
    .values({ key: KEY, value: map as unknown as string })
    .onConflictDoUpdate({ target: settings.key, set: { value: map as unknown as string } })
    .run();
}

export function getPolicy(toolName: string): Policy {
  const map = load();
  if (toolName in map) return map[toolName];
  return (
    (BUILTIN_TOOLS as Record<string, ToolRegistryEntry | undefined>)[toolName]?.defaultPolicy ??
    'ask'
  );
}

export function setPolicy(toolName: string, policy: Policy): void {
  save({ ...load(), [toolName]: policy });
}

export function listPolicies(): { name: string; policy: Policy }[] {
  return TOOL_CATALOG.map(({ name }) => ({ name, policy: getPolicy(name) }));
}
