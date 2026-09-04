import { describe, expect, it } from 'vitest'

import {
  buildRoleGrantScope,
  buildStaticGrantKey,
  canReadExactRuntimeItem,
  canSubjectManageAssignments,
  evaluateAuthorizationResolution,
  exactEntityGrantAllows,
  getAuthorizationOwnerAgencyId,
  getRoleScopeType,
  isAbilityAllowedForRoleScope,
  isAuthorizationAction,
  isAuthorizationScopeCovered,
  isAuthorizationSubject,
  isRoleAbility,
  isRoleAbilitySubject,
  isRoleGrantSubject,
  isRoleScopeType,
  UserAbilities,
  type AuthorizationScope,
  type ExactEntityGrant,
  type StaticAuthorizationGrantInput
} from '../../src'
import { canonicalizeAuthorizationLockIds } from '../../src/server'

describe('authorization vocabulary and scope policy', () => {
  it('narrows only supported actions and subjects', () => {
    expect(isAuthorizationAction('update')).toBe(true)
    expect(isAuthorizationAction('approve')).toBe(false)
    expect(isAuthorizationAction(1)).toBe(false)
    expect(isAuthorizationSubject('agreement')).toBe(true)
    expect(isAuthorizationSubject('all')).toBe(false)
    expect(isAuthorizationSubject(null)).toBe(false)
    expect(isRoleAbilitySubject('agency')).toBe(true)
    expect(isRoleAbilitySubject('unknown')).toBe(false)
    expect(isRoleGrantSubject('applicant_recipient')).toBe(true)
  })

  it.each([
    [{ action: 'read', subject: 'agency' }, true],
    [{ action: 'approve', subject: 'agency' }, false],
    [{ action: 'read', subject: 'unknown' }, false],
    [{ action: 'read', subject: 1 }, false]
  ])('validates role ability %j', (ability, expected) => {
    expect(isRoleAbility(ability)).toBe(expected)
  })

  it('derives and validates structural role scopes', () => {
    expect(isRoleScopeType('global')).toBe(true)
    expect(isRoleScopeType('entity')).toBe(false)
    expect(isRoleScopeType(1)).toBe(false)
    expect(getRoleScopeType(null, 1)).toBe('global')
    expect(getRoleScopeType(undefined, 0)).toBe('global')
    expect(getRoleScopeType('agency-1', 0)).toBe('agency')
    expect(getRoleScopeType('agency-1', 1)).toBe('program')
    expect(buildRoleGrantScope('global')).toEqual({ type: 'global' })
    expect(buildRoleGrantScope('agency')).toBeNull()
    expect(buildRoleGrantScope('agency', 'agency-1')).toEqual({ type: 'agency', agencyId: 'agency-1' })
    expect(buildRoleGrantScope('program', 'agency-1')).toBeNull()
    expect(buildRoleGrantScope('program', 'agency-1', 'program-1')).toEqual({
      type: 'program', agencyId: 'agency-1', transferPaymentId: 'program-1'
    })
    expect(isAbilityAllowedForRoleScope('system', 'global')).toBe(true)
    expect(isAbilityAllowedForRoleScope('system', 'agency')).toBe(false)
    expect(isAbilityAllowedForRoleScope('unknown', 'global')).toBe(false)
    expect(canSubjectManageAssignments('agreement')).toBe(true)
    expect(canSubjectManageAssignments('agency')).toBe(false)
  })

  it.each([
    [{ type: 'global' }, { type: 'program', agencyId: '2', transferPaymentId: '3' }, true],
    [{ type: 'agency', agencyId: '2' }, { type: 'global' }, false],
    [{ type: 'agency', agencyId: '2' }, { type: 'agency', agencyId: 2 as never }, true],
    [{ type: 'agency', agencyId: '2' }, { type: 'agency', agencyId: '3' }, false],
    [{ type: 'program', agencyId: '2', transferPaymentId: '3' }, { type: 'program', agencyId: '2', transferPaymentId: 3 as never }, true],
    [{ type: 'program', agencyId: '2', transferPaymentId: '3' }, { type: 'program', agencyId: '2', transferPaymentId: '4' }, false],
    [{ type: 'program', agencyId: '2', transferPaymentId: '3' }, { type: 'agency', agencyId: '2' }, false],
    [{ type: 'program', agencyId: '2', transferPaymentId: '3' }, { type: 'entity', agencyId: '4', path: [] }, false],
    [{ type: 'program', agencyId: '2', transferPaymentId: '3' }, { type: 'entity', agencyId: '2', path: [] }, false],
    [{ type: 'program', agencyId: '2', transferPaymentId: '3' }, { type: 'entity', agencyId: '2', path: [{ type: 'transfer_payment', id: '3' }] }, true],
    [{ type: 'entity', agencyId: '2', path: [{ type: 'agreement', id: '3' }] }, { type: 'agency', agencyId: '2' }, false],
    [{ type: 'entity', agencyId: '2', path: [{ type: 'agreement', id: '3' }] }, { type: 'entity', agencyId: '4', path: [{ type: 'agreement', id: '3' }] }, false],
    [{ type: 'entity', agencyId: '2', path: [{ type: 'agreement', id: '3' }, { type: 'claim', id: '4' }] }, { type: 'entity', agencyId: '2', path: [{ type: 'agreement', id: '3' }] }, false],
    [{ type: 'entity', agencyId: '2', path: [{ type: 'agreement', id: '3' }] }, { type: 'entity', agencyId: '2', path: [] }, false],
    [{ type: 'entity', agencyId: '2', path: [{ type: 'agreement', id: '3' }] }, { type: 'entity', agencyId: '2', path: [{ type: 'claim', id: '3' }] }, false],
    [{ type: 'entity', agencyId: '2', path: [{ type: 'agreement', id: '3' }] }, { type: 'entity', agencyId: '2', path: [{ type: 'agreement', id: 3 as never }, { type: 'claim', id: '4' }] }, true]
  ] as Array<[AuthorizationScope, AuthorizationScope, boolean]>)('evaluates scope coverage %#', (grant, required, expected) => {
    expect(isAuthorizationScopeCovered(grant, required)).toBe(expected)
  })
})

describe('static and exact authorization decisions', () => {
  const grants: StaticAuthorizationGrantInput[] = [
    { source: 'role', action: 'read', subject: 'agreement', scope: { type: 'agency', agencyId: '2' } },
    { source: 'role', action: 'update', subject: 'agreement', scope: { type: 'program', agencyId: '2', transferPaymentId: '3' } },
    { source: 'role', action: 'manage_assignments', subject: 'agreement', scope: { type: 'agency', agencyId: '2' } },
    { source: 'role', action: 'read', subject: 'agreement', scope: { type: 'agency', agencyId: '2' } }
  ]

  it('normalizes, deduplicates, clones, sorts, and evaluates role grants', () => {
    const abilities = new UserAbilities([
      ...grants,
      { source: 'other' as never, action: 'read', subject: 'agreement', scope: { type: 'global' } },
      { source: 'role', action: 'read', subject: 'agreement', scope: { type: 'entity', agencyId: '2', path: [] } },
      { source: 'role', action: 'manage_assignments', subject: 'agency', scope: { type: 'global' } },
      { source: 'role', action: 'approve' as never, subject: 'agreement', scope: { type: 'global' } },
      { source: 'role', action: 'read', subject: 'system', scope: { type: 'agency', agencyId: '2' } }
    ])

    expect(abilities.getGrants()).toHaveLength(3)
    expect(abilities.authorize('agreement', 'read', { type: 'agency', agencyId: '2' })).toBe(true)
    expect(abilities.authorize('agreement', 'delete', { type: 'agency', agencyId: '2' })).toBe(false)
    expect(abilities.canManageAssignments('agreement', { type: 'agency', agencyId: '2' })).toBe(true)
    expect(abilities.canManageAssignments('applicant_recipient', { type: 'agency', agencyId: '2' })).toBe(false)
    const returned = abilities.getGrants()
    ;(returned[0]!.scope as { agencyId?: string }).agencyId = 'changed'
    expect(abilities.getGrants()).not.toEqual(returned)
    expect(buildStaticGrantKey(abilities.getGrants()[0]!)).toMatch(/^role:/)
  })

  it('requires exact type, identifier, and action matches', () => {
    const grant: ExactEntityGrant<'claim' | 'payment'> = {
      source: 'assignment', entityType: 'claim', entityId: '4', actions: new Set(['read', 'update'])
    }
    expect(exactEntityGrantAllows(grant, 'claim', '4', 'update')).toBe(true)
    expect(exactEntityGrantAllows(grant, 'claim', 4 as never, 'read')).toBe(true)
    expect(exactEntityGrantAllows(grant, 'payment', '4', 'read')).toBe(false)
    expect(exactEntityGrantAllows(grant, 'claim', '5', 'read')).toBe(false)
    expect(exactEntityGrantAllows(grant, 'claim', '4', 'delete')).toBe(false)
  })

  it.each([
    [{ denied: true }, { allowed: false }],
    [{ agencyIds: [], hasGlobalAccess: false }, { allowed: false }],
    [{ agencyIds: ['2'], hasGlobalAccess: false }, { allowed: true, agencyIds: ['2'], hasGlobalAccess: false }],
    [{ agencyIds: [], hasGlobalAccess: true }, { allowed: true, agencyIds: [], hasGlobalAccess: true }],
    [{ bypass: false }, { allowed: false }],
    [{ bypass: true, data: 'bypass' }, { allowed: true, data: 'bypass' }],
    [{ scopes: [] }, { allowed: false }],
    [{ scopes: [{ type: 'agency', agencyId: '3' }], data: 'wrong' }, { allowed: false }],
    [{ scopes: [{ type: 'agency', agencyId: '2' }], data: 'right' }, { allowed: true, data: 'right' }],
    [{ scope: { type: 'agency', agencyId: '3' }, data: 'wrong' }, { allowed: false }],
    [{ scope: { type: 'agency', agencyId: '2' }, data: 'right' }, { allowed: true, data: 'right', scope: { type: 'agency', agencyId: '2' } }]
  ] as const)('evaluates resolved decision %#', (resolution, expected) => {
    expect(evaluateAuthorizationResolution(
      new UserAbilities(grants),
      'agreement',
      'read',
      resolution as never
    )).toEqual(expected)
  })

  it('keeps exact assignment evidence below the read ceiling', () => {
    expect(canReadExactRuntimeItem({
      hasInheritedOwnerRead: true,
      hasExactItemAssignment: false,
      hasExactSourceAssignment: false,
      hasApprovalAssignment: false
    })).toBe(true)
    expect(canReadExactRuntimeItem({
      hasInheritedOwnerRead: false,
      hasExactItemAssignment: true,
      hasExactSourceAssignment: true,
      hasApprovalAssignment: false
    })).toBe(false)
    expect(canReadExactRuntimeItem({
      hasInheritedOwnerRead: false,
      hasExactItemAssignment: false,
      hasExactSourceAssignment: false,
      hasApprovalAssignment: true
    })).toBe(true)
  })

  it('derives owner agency and canonical lock order without widening identity', () => {
    expect(getAuthorizationOwnerAgencyId({ kind: 'agreement', agreementId: '1', agencyId: '2' })).toBe('2')
    expect(getAuthorizationOwnerAgencyId({ kind: 'applicant_recipient', applicantRecipientId: '1', agencyId: '3' })).toBe('3')
    expect(getAuthorizationOwnerAgencyId({ kind: 'agency', agencyId: '4' })).toBe('4')
    expect(getAuthorizationOwnerAgencyId({ kind: 'transfer_payment_stream', agencyId: '5', transferPaymentId: '6', streamId: '7' })).toBe('5')
    expect(canonicalizeAuthorizationLockIds(['user-10', 'user-2', 'user-1', 'user-2']))
      .toEqual(['user-1', 'user-2', 'user-10'])
  })
})
