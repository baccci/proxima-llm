import { describe, expect, test } from 'bun:test'
import { IconFolderOpen } from '@/components/icons/icon-folder-open'
import { IconSuitcase } from '@/components/icons/icon-suitcase'
import { getProjectIcon } from './project-icon'

describe('getProjectIcon', () => {
  test('known key returns its component', () => {
    expect(getProjectIcon('suitcase')).toBe(IconSuitcase)
  })
  test('null returns the folder icon', () => {
    expect(getProjectIcon(null)).toBe(IconFolderOpen)
  })
  test('unknown key returns the folder icon', () => {
    expect(getProjectIcon('nope')).toBe(IconFolderOpen)
  })
})
