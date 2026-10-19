import { describe, expect, it } from 'vitest'
import { createGuideSession } from '../../src/session'
import type { GuideDocument } from '../../src/contracts'

const text = { en: 'Help', fr: 'Aide' }
const document: GuideDocument = {
  formatVersion: 1, title: text, description: text,
  steps: [{ id: 'first', view: 'review.detail', target: 'review.answers', kind: 'section', title: text, instructions: text }],
  journey: { adapter: 'reviews', stages: [{ id: 'review', kind: 'tasks', guideStepIds: ['first'] }] }
}
/** Create a tab session fixture.
 * @returns Session and persisted-state manipulation helpers.
 */
const setup = () => {
  let raw: string | null = null
  const tab = {
    getItem: () => raw,
    setItem: (_key: string, value: string) => { raw = value },
    removeItem: () => { raw = null }
  }
  const session = createGuideSession(tab)
  session.launch({ userId: 'user', agencyId: 'agency', publicationId: 'publication', versionId: 'version', document })
  return { session, tab, /**
   *
   * @param change Mutation representing corrupted browser storage.
   */
    forge: (change: (snapshot: Record<string, unknown>) => void) => {
      const snapshot = JSON.parse(raw!)
      change(snapshot)
      raw = JSON.stringify(snapshot)
    } }
}
const binding = { resourceType: 'agreement', resourceId: '1' }
const cursor = { kind: 'tasks' as const, stageId: 'review', stepId: 'first', taskId: 'review-1' }

describe('journey session', () => {
  it('pins typed instance progress across refresh without ordinary navigation history', () => {
    const { session, tab } = setup()
    expect(session.updateJourney('user', { binding, cursor: null })?.journey?.binding).toEqual(binding)
    session.updateJourney('user', { binding, cursor })
    const restored = createGuideSession(tab).restore('user')
    expect(restored?.journey).toEqual({ binding, cursor })
    expect(restored?.path).toBeUndefined()
    expect(restored?.versionId).toBe('version')
    expect(session.select('user', 'first')).toBeNull()
  })
  it('isolates users and resets progress when binding changes', () => {
    const { session, tab } = setup()
    session.updateJourney('user', { binding, cursor: null })
    session.updateJourney('user', { binding, cursor })
    expect(session.updateJourney('user', { binding: { ...binding, resourceId: '2' }, cursor })?.journey?.cursor).toBeNull()
    expect(createGuideSession(tab).restore('other')).toBeNull()
    expect(session.restore('user')).toBeNull()
  })
  it('rejects forged references and malformed persisted cursor shapes', () => {
    const { session, forge } = setup()
    session.updateJourney('user', { binding, cursor: null })
    expect(session.updateJourney('user', { binding, cursor: { ...cursor, stageId: 'forged' } })).toBeNull()
    expect(session.updateJourney('user', { binding, cursor: { ...cursor, stepId: 'forged' } })).toBeNull()
    forge(value => {
      value.journey = { binding, cursor: { ...cursor, kind: 'once' } }
    })
    expect(session.restore('user')).toBeNull()
    const malformed = setup()
    malformed.forge(value => {
      value.journey = { binding, cursor: { ...cursor, taskId: 4 } }
    })
    expect(malformed.session.restore('user')).toBeNull()
  })
  it('defaults missing state and ignores incompatible ordinary paths for journeys', () => {
    const { session, forge } = setup()
    forge(value => {
      delete value.journey
      value.path = ['first', 'first']
    })
    expect(session.restore('user')?.journey).toEqual({ binding: null, cursor: null })
    expect(session.restore('user')?.path).toBeUndefined()
  })
  it('persists an unbound once stage before a business record exists', () => {
    const { session, tab } = setup()
    const onceDocument: GuideDocument = { ...document, journey: { adapter: 'reviews', stages: [{ id: 'prepare', kind: 'once', guideStepIds: ['first'] }] } }
    session.launch({ userId: 'user', agencyId: 'agency', publicationId: 'publication', versionId: 'version', document: onceDocument })
    const once = { kind: 'once' as const, stageId: 'prepare', stepId: 'first' }
    expect(session.updateJourney('user', { binding: null, cursor: once })?.journey?.cursor).toEqual(once)
    expect(createGuideSession(tab).restore('user')?.journey?.cursor).toEqual(once)
    expect(session.updateJourney('user', { binding, cursor: once })?.journey?.cursor).toBeNull()
  })
  it('restores task-specific template instructions within their declared stage', () => {
    const { session, tab } = setup()
    const templateDocument: GuideDocument = {
      ...document,
      steps: [...document.steps, { ...document.steps[0]!, id: 'checklist' }],
      journey: { adapter: 'reviews', stages: [{ id: 'review', kind: 'tasks', guideStepIds: ['first'], taskTemplates: [{ key: 'checklist', guideStepIds: ['checklist'] }] }] }
    }
    session.launch({ userId: 'user', agencyId: 'agency', publicationId: 'publication', versionId: 'version', document: templateDocument })
    session.updateJourney('user', { binding, cursor: null })
    const templateCursor = { ...cursor, stepId: 'checklist' }
    expect(session.updateJourney('user', { binding, cursor: templateCursor })?.journey?.cursor).toEqual(templateCursor)
    expect(createGuideSession(tab).restore('user')?.journey?.cursor).toEqual(templateCursor)
    expect(session.updateJourney('user', { binding, cursor: { ...templateCursor, stageId: 'other' } })).toBeNull()
  })
  it('rejects journey updates for ordinary guides', () => {
    const { session } = setup()
    const { journey: _journey, ...ordinary } = document
    session.launch({ userId: 'user', agencyId: 'agency', publicationId: 'publication', versionId: 'version', document: ordinary })
    expect(session.updateJourney('user', { binding, cursor })).toBeNull()
  })
})
