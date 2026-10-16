// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createGuideSession } from '../../src/session'

const document = { formatVersion: 1 as const, title: { en: 'Help', fr: 'Aide' }, description: { en: 'Help', fr: 'Aide' }, steps: [{ id: 'first', view: 'agency.general', target: 'agency.name', kind: 'text' as const, title: { en: 'Name', fr: 'Nom' }, instructions: { en: 'Enter name', fr: 'Saisir le nom' } }] }
/**
 * Provide an isolated in-memory browser storage adapter.
 * @returns Storage operations sharing one tab-local map.
 */
const storage = () => {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
    removeItem: (key: string) => {
      values.delete(key)
    }
  }
}
describe('guide browser session', () => {
  it('restores a pinned guide across refresh but clears it for another identity', () => {
    const tab = storage()
    const session = createGuideSession(tab)
    session.launch({ userId: '1', agencyId: '2', publicationId: '3', versionId: '4', document })
    expect(createGuideSession(tab).restore('1')?.versionId).toBe('4')
    expect(createGuideSession(tab).restore('other')).toBeNull()
    expect(session.restore('1')).toBeNull()
  })
})

describe('manual progress persistence', () => {
  it('persists only valid manual selections and clears on explicit exit', () => {
    const tab = storage()
    const session = createGuideSession(tab)
    session.launch({ userId: '1', agencyId: '2', publicationId: '3', versionId: '4', document })
    expect(session.select('1', 'unknown')).toBeNull()
    expect(session.select('1', 'first')?.stepId).toBe('first')
    session.clear()
    expect(session.restore('1')).toBeNull()
  })
  it('discards corrupt persisted content and works when browser storage is blocked', () => {
    const session = createGuideSession({ getItem: () => '{bad', setItem: () => {
      throw new Error('blocked')
    }, removeItem: () => {
      throw new Error('blocked')
    } })
    expect(session.restore('1')).toBeNull()
    expect(session.launch({ userId: '1', agencyId: '2', publicationId: '3', versionId: '4', document }).stepId).toBe('first')
  })
})

it('keeps manual progress in memory when every browser storage operation throws', () => {
  const blocked = () => {
    throw new Error('blocked')
  }
  const session = createGuideSession({ getItem: blocked, setItem: blocked, removeItem: blocked })
  session.launch({ userId: '1', agencyId: '2', publicationId: '3', versionId: '4', document })
  expect(session.select('1', 'first')?.stepId).toBe('first')
  expect(session.restore('other')).toBeNull()
  expect(session.restore('1')).toBeNull()
})
