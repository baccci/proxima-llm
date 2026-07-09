import type { MemoryScope } from '../../../shared-contracts/schemas/memory-slice.schema';

type Push = (scope: MemoryScope, projectId: string | null) => void;
type RegenHook = (projectId: string) => void;

let pushMemoryChanged: Push | null = null;
let regenProjectSummary: RegenHook | null = null;

export function setMemoryChangedPush(fn: Push): void {
  pushMemoryChanged = fn;
}

// App wires the project-summary regen here (it coordinates model + project + llm,
// so the workflow lives in app/, not this feature).
export function setMemoryRegenHook(fn: RegenHook): void {
  regenProjectSummary = fn;
}

// Fire the renderer push for a memory change. Also called by the regen workflow
// once a freshly generated summary has been written.
export function emitMemoryChanged(scope: MemoryScope, projectId: string | null): void {
  pushMemoryChanged?.(scope, projectId);
}

// Single entry point for every memory write/delete path (RPC user edits + model
// tools). Pushes immediately so the slice list refreshes without a restart, then
// kicks off async summary regen for project scope.
export function notifyMemoryChanged(scope: MemoryScope, projectId: string | null): void {
  emitMemoryChanged(scope, projectId);
  if (scope === 'project' && projectId) regenProjectSummary?.(projectId);
}
