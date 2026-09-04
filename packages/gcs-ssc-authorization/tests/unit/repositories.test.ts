import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ApprovalItemAuthorizationRepository,
  AssignedItemAuthorizationRepository,
  ExactAuthorizationService,
  resolveApprovalItemGrant,
  resolveAssignedItemGrant,
  resolveAssignedItemTargetGrant,
  StaticAuthorizationRepository,
  type ExactEntityGrant
} from '../../src/server'

/**
 * Creates the minimal fluent query used by repository behavior tests.
 * @param result - Row or row collection returned by the fake query.
 * @returns A fluent query double with tracked lock and execution calls.
 */
const queryChain = (result: unknown) => {
  const query: Record<string, ReturnType<typeof vi.fn>> = {}
  for (const method of ['innerJoin', 'select', 'where', 'forUpdate']) {
    query[method] = vi.fn(() => query)
  }
  query.execute = vi.fn(async () => result)
  query.executeTakeFirst = vi.fn(async () => result)
  return query
}

describe('exact authorization repositories', () => {
  beforeEach(() => vi.clearAllMocks())

  it('requires a transaction before locking an assignment', async () => {
    const query = queryChain(null)
    const repository = new AssignedItemAuthorizationRepository({
      isTransaction: false,
      selectFrom: vi.fn(() => query)
    } as never)

    expect(() => repository.assertFreshContext()).toThrow('active transaction')
    await expect(repository.resolve('user-1', 'fundingcaseagreement', '4', { lock: true }))
      .rejects.toThrow('active transaction')
    expect(query.forUpdate).not.toHaveBeenCalled()
  })

  it('resolves and locks the exact active assignment inside a transaction', async () => {
    const query = queryChain({ common_user_id: 2, assignment_id: 3, is_primary: true })
    const db = { isTransaction: true, selectFrom: vi.fn(() => query) } as never
    const repository = new AssignedItemAuthorizationRepository(db)

    expect(() => repository.assertFreshContext()).not.toThrow()
    await expect(repository.resolveTarget('user-1', {
      entityType: 'fundingcaseagreement', entityId: '4'
    }, { lock: true })).resolves.toMatchObject({
      source: 'assignment',
      entityType: 'fundingcaseagreement',
      entityId: '4',
      commonUserId: '2',
      assignmentId: '3',
      isPrimary: true
    })
    expect(query.forUpdate).toHaveBeenCalledWith('Common_Entity_Assignment')
  })

  it('returns null for a missing assignment and supports both wrapper forms', async () => {
    const missingQuery = queryChain(null)
    const dbMissing = { isTransaction: false, selectFrom: vi.fn(() => missingQuery) } as never
    await expect(resolveAssignedItemGrant('user-1', 'fundingcaseagreement', '4', dbMissing)).resolves.toBeNull()

    const row = { common_user_id: '2', assignment_id: '3', is_primary: false }
    const targetQuery = queryChain(row)
    const dbTarget = { isTransaction: false, selectFrom: vi.fn(() => targetQuery) } as never
    await expect(resolveAssignedItemTargetGrant('user-1', {
      entityType: 'fundingcaseagreement', entityId: '4'
    }, dbTarget)).resolves.toMatchObject({ assignmentId: '3', isPrimary: false })
  })

  it('evaluates cached and freshly locked exact grants without widening them', async () => {
    const grant: ExactEntityGrant<'claim'> = {
      source: 'assignment', entityType: 'claim', entityId: '4', actions: new Set(['read', 'update'])
    }
    const repository = {
      assertFreshContext: vi.fn(),
      resolve: vi.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(grant)
        .mockResolvedValueOnce(grant)
    }
    const service = new ExactAuthorizationService(repository)

    await expect(service.can('context', 'claim', '4', 'read')).resolves.toBe(false)
    await expect(service.can('context', 'claim', '5', 'read')).resolves.toBe(false)
    await expect(service.canFresh('context', 'claim', '4', 'update')).resolves.toBe(true)
    expect(repository.assertFreshContext).toHaveBeenCalledWith('context')
    expect(repository.resolve).toHaveBeenLastCalledWith('context', 'claim', '4', { lock: true })
  })

  it('denies a fresh exact grant when it was concurrently removed', async () => {
    const repository = {
      assertFreshContext: vi.fn(),
      resolve: vi.fn(async () => null)
    }
    await expect(new ExactAuthorizationService(repository)
      .canFresh('context', 'claim', '4', 'update')).resolves.toBe(false)
  })

  it('resolves approval-only read evidence and returns null when absent', async () => {
    const rowQuery = queryChain({ common_user_id: 2, approval_id: 3 })
    const rowDb = { selectFrom: vi.fn(() => rowQuery) } as never
    await expect(new ApprovalItemAuthorizationRepository(rowDb).resolve('user-1', {
      entityType: 'fundingcaseagreement', entityId: '4'
    })).resolves.toMatchObject({
      source: 'approval', commonUserId: '2', approvalId: '3', entityId: '4'
    })

    const missingQuery = queryChain(null)
    const missingDb = { selectFrom: vi.fn(() => missingQuery) } as never
    await expect(resolveApprovalItemGrant('user-1', {
      entityType: 'fundingcaseagreement', entityId: '4'
    }, missingDb)).resolves.toBeNull()
  })
})

describe('static authorization repository', () => {
  it('expands cumulative access, independent roster management, and overlapping roles', async () => {
    const users = queryChain([{ id: 'user-1' }, { id: 'user-2' }])
    const permissions = queryChain([
      { role_id: 'role-1', subject: 'agreement', access_level: 'viewer', can_manage_assignments: false },
      { role_id: 'role-2', subject: 'agreement', access_level: 'contributor', can_manage_assignments: true },
      { role_id: 'role-3', subject: 'applicant_recipient', access_level: 'manager', can_manage_assignments: false },
      { role_id: 'role-3', subject: 'unknown', access_level: 'manager', can_manage_assignments: false },
      { role_id: 'role-3', subject: 'system', access_level: 'manager', can_manage_assignments: false }
    ])
    const db = { selectFrom: vi.fn((table: string) => table === 'user' ? users : permissions) } as never
    const loadAssignments = vi.fn(async () => [
      { assignmentId: '1', userId: 'user-1', roleId: 'role-1', scopeType: 'global' as const, agencyId: null, transferPaymentId: null },
      { assignmentId: '2', userId: 'user-1', roleId: 'role-2', scopeType: 'agency' as const, agencyId: '2', transferPaymentId: null },
      { assignmentId: '3', userId: 'user-2', roleId: 'role-3', scopeType: 'program' as const, agencyId: '2', transferPaymentId: '3' },
      { assignmentId: '4', userId: 'deleted-user', roleId: 'role-3', scopeType: 'global' as const, agencyId: null, transferPaymentId: null }
    ])
    const repository = new StaticAuthorizationRepository(db, loadAssignments)
    const abilities = await repository.loadUsersAbilities(['user-1', 'user-2', 'deleted-user', 'user-1'])

    expect(loadAssignments).toHaveBeenCalledWith(db, ['user-1', 'user-2', 'deleted-user'])
    expect(abilities.get('user-1')?.authorize('agreement', 'read', { type: 'global' })).toBe(true)
    expect(abilities.get('user-1')?.authorize('agreement', 'update', { type: 'agency', agencyId: '2' })).toBe(true)
    expect(abilities.get('user-1')?.canManageAssignments('agreement', { type: 'agency', agencyId: '2' })).toBe(true)
    expect(abilities.get('user-2')?.getGrants()).toEqual([])
    expect(abilities.get('deleted-user')?.getGrants()).toEqual([])
  })

  it('returns empty abilities without querying permissions when no structural role exists', async () => {
    const users = queryChain([{ id: 'user-1' }])
    const db = { selectFrom: vi.fn(() => users) } as never
    const repository = new StaticAuthorizationRepository(db, async () => [])

    await expect(repository.loadUserAbilities('user-1')).resolves.toMatchObject({})
    expect((await repository.loadUserAbilities('user-1')).getGrants()).toEqual([])
    expect(db.selectFrom).toHaveBeenCalledTimes(2)
  })

  it('returns an empty map for no requested users', async () => {
    const loadAssignments = vi.fn(async () => [])
    const repository = new StaticAuthorizationRepository({} as never, loadAssignments)
    await expect(repository.loadUsersAbilities([])).resolves.toEqual(new Map())
    expect(loadAssignments).not.toHaveBeenCalled()
  })

  it('lists unique non-global active assignment agencies', async () => {
    const repository = new StaticAuthorizationRepository({} as never, async () => [
      { assignmentId: '1', userId: 'user-1', roleId: '1', scopeType: 'global', agencyId: null, transferPaymentId: null },
      { assignmentId: '2', userId: 'user-1', roleId: '2', scopeType: 'agency', agencyId: '2', transferPaymentId: null },
      { assignmentId: '3', userId: 'user-1', roleId: '3', scopeType: 'program', agencyId: '2', transferPaymentId: '3' },
      { assignmentId: '4', userId: 'user-1', roleId: '4', scopeType: 'agency', agencyId: null, transferPaymentId: null }
    ])

    await expect(repository.listAssignedAgencyIds('user-1')).resolves.toEqual(['2'])
  })
})
