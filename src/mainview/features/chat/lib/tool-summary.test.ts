import { describe, expect, test } from 'bun:test'
import { getToolSummary } from './tool-summary'

describe('getToolSummary delete_memory', () => {
  const input = { scope: 'global', title: 'coding-style' }

  test('a successful delete reads as deleted', () => {
    const summary = getToolSummary('delete_memory', input, { deleted: true, title: 'coding-style' })
    expect(summary?.heading).toBe('Deleted global memory: coding-style')
  })

  test('a blocked delete reads as blocked, not deleted', () => {
    const output = {
      blocked: true,
      reason: 'Denied by user.',
      message: 'The delete_memory tool did not run.',
    }
    const summary = getToolSummary('delete_memory', input, output)
    expect(summary?.heading).not.toContain('Deleted')
    expect(summary?.heading?.toLowerCase()).toContain('block')
    expect(summary?.heading).toContain('coding-style')
  })
})
