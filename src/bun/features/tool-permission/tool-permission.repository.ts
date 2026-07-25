import { z } from 'zod';
import {
  defaultPolicyFor,
  isAlwaysAllowed,
  TOOL_CATALOG,
} from '../../../shared-contracts/tools/tool-catalog';
import { ToolPolicy } from '../../../shared-contracts/tools/tool-policy';
import { readSettingsBlob, writeSettingsBlob } from '../../infra/db/settings-store';

// This module owns the tool_policies slice of the shared settings table.
const KEY = 'tool_policies';

const PolicyMap = z.record(z.string(), ToolPolicy);
type PolicyMap = z.infer<typeof PolicyMap>;

function load(): PolicyMap {
  const raw = readSettingsBlob(KEY);
  return raw !== undefined ? PolicyMap.parse(raw) : {};
}

function save(map: PolicyMap): void {
  writeSettingsBlob(KEY, map);
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

// The renderer's tool-policy list: each catalog entry (name + label + description)
// joined with its current effective policy. getPolicy always resolves a policy,
// so every entry has one.
export function listPoliciesDetailed(): {
  name: string;
  label: string;
  description: string;
  policy: ToolPolicy;
}[] {
  return TOOL_CATALOG.map(({ name, label, description }) => ({
    name,
    label,
    description,
    policy: getPolicy(name),
  }));
}
