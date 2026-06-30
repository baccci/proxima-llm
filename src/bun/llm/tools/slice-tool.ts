import { tool } from 'ai';
import { z } from 'zod';
import { CAPABILITY_SLICES } from './slices';

const capabilityKeys = Object.keys(CAPABILITY_SLICES) as [string, ...string[]];

export const sliceTool = tool({
  description:
    'Fetch detailed information about a specific Proxima feature. Call this when the user asks about a capability and you need more detail.',
  inputSchema: z.object({
    capability: z.enum(capabilityKeys).describe('The feature to get detail about'),
  }),
  execute: async ({ capability }) => {
    return CAPABILITY_SLICES[capability] ?? 'Unknown capability key.';
  },
});
