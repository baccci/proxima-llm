import { describe, expect, it } from 'bun:test'
import { DEFAULT_HOOK_CONFIG, HOOK_ACTION_ID, HOOK_CATALOG, HOOK_META } from './hook-catalog'

describe('HOOK_CATALOG', () => {
  it('holds the three core built-ins as non-manageable and enabled by default', () => {
    for (const id of [
      HOOK_ACTION_ID.compaction,
      HOOK_ACTION_ID.autoTitle,
      HOOK_ACTION_ID.memorySummary,
    ]) {
      const entry = HOOK_META.get(id)
      expect(entry?.userManageable).toBe(false)
      expect(entry?.defaultEnabled).toBe(true)
    }
  })

  it('holds the opt-in hooks as manageable and disabled by default', () => {
    for (const id of [
      HOOK_ACTION_ID.completionSound,
      HOOK_ACTION_ID.completionNotification,
      HOOK_ACTION_ID.errorSound,
      HOOK_ACTION_ID.approvalSound,
    ]) {
      const entry = HOOK_META.get(id)
      expect(entry?.userManageable).toBe(true)
      expect(entry?.defaultEnabled).toBe(false)
    }
  })

  it('derives DEFAULT_HOOK_CONFIG one-to-one from the catalog with matching enabled bits', () => {
    expect(DEFAULT_HOOK_CONFIG).toHaveLength(HOOK_CATALOG.length)
    for (const entry of HOOK_CATALOG) {
      const cfg = DEFAULT_HOOK_CONFIG.find((c) => c.actionId === entry.actionId)
      expect(cfg?.enabled).toBe(entry.defaultEnabled)
      expect(cfg?.stage).toBe(entry.stage)
      expect(cfg?.provenance).toBe(entry.provenance)
    }
  })
})
