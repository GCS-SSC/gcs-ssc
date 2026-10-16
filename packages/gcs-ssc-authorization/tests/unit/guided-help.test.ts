import { describe, expect, it } from 'vitest'
import { isAuthorizationSubject } from '../../src/abilities'
import { canSubjectManageAssignments, isAbilityAllowedForRoleScope } from '../../src/role-scopes'

describe('Guided Help administration boundary', () => {
  it('supports global and agency roles without program scope or assignments', () => {
    expect(isAuthorizationSubject('guided_help')).toBe(true)
    expect(isAbilityAllowedForRoleScope('guided_help', 'global')).toBe(true)
    expect(isAbilityAllowedForRoleScope('guided_help', 'agency')).toBe(true)
    expect(isAbilityAllowedForRoleScope('guided_help', 'program')).toBe(false)
    expect(canSubjectManageAssignments('guided_help')).toBe(false)
  })
})

it('agency editing authority never covers System or sibling agencies', async () => {
  const { UserAbilities } = await import('../../src/grants')
  const abilities = new UserAbilities([{ source: 'role', subject: 'guided_help', action: 'update', scope: { type: 'agency', agencyId: '12' } }])
  expect(abilities.authorize('guided_help', 'update', { type: 'agency', agencyId: '12' })).toBe(true)
  expect(abilities.authorize('guided_help', 'update', { type: 'agency', agencyId: '34' })).toBe(false)
  expect(abilities.authorize('guided_help', 'update', { type: 'global' })).toBe(false)
  expect(abilities.authorize('guided_help', 'delete', { type: 'agency', agencyId: '12' })).toBe(false)
})
