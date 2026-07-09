import { eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  defaultPolicyFor,
  isAlwaysAllowed,
  TOOL_CATALOG,
} from '../../../shared-contracts/tools/tool-catalog';
import { ToolPolicy } from '../../../shared-contracts/tools/tool-policy';
import { db } from '../../infra/db/client';
import { settings } from '../../infra/db/schema';

// This module owns the tool_policies slice of the shared settings table.
const KEY = 'tool_policies';

const PolicyMap = z.record(z.string(), ToolPolicy);
type PolicyMap = z.infer<typeof PolicyMap>;

function load(): PolicyMap {
  const row = db.select().from(settings).where(eq(settings.key, KEY)).get();
  return row ? PolicyMap.parse(row.value) : {};
}

function save(map: PolicyMap): void {
  db.insert(settings)
    .values({ key: KEY, value: map as unknown as string })
    .onConflictDoUpdate({ target: settings.key, set: { value: map as unknown as string } })
    .run();
}

export function getPolicy(toolName: string): ToolPolicy {
  if (isAlwaysAllowed(toolName)) {
    return 'allow';
  }

  const map = load();

  if (toolName in map) {
    return map[toolName];
  }

  return defaultPolicyFor(toolName);
}

export function setPolicy(toolName: string, policy: ToolPolicy): void {
  if (isAlwaysAllowed(toolName)) {
    return;
  }

  save({ ...load(), [toolName]: policy });
}

export function listPolicies(): { name: string; policy: ToolPolicy }[] {
  return TOOL_CATALOG.map(({ name }) => ({ name, policy: getPolicy(name) }));
}
