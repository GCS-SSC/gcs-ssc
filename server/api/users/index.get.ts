/* eslint-disable jsdoc/require-jsdoc -- route-local query helpers are clear from their names and types */
import { PaginationSchema } from '~~/shared/types/schemas'
import type { UserListItem } from '~~/shared/types/users'
import {
  getActiveUserManagementScopes,
  selectActiveStructuralRoleIds
} from '~~/server/utils/active-user-scopes'
import {
  authorize,
  resolveAnyAgency,
  resolveAuthorizedAgencyAccess
} from '~~/server/utils/authorize'
import { escapeLikePattern } from '~~/server/utils/sql-like'

export default defineEventHandler(async event => {
  const db = event.context.$db

  const auth = await authorize(
    event,
    'user',
    'read',
    resolveAnyAgency(db)
  )

  const agencyIds = auth.agencyIds ?? []
  const hasUnscopedRead = auth.hasGlobalAccess === true

  const query = await getValidatedQueryI18n(event, PaginationSchema)
  const { page, limit, search } = query
  const offset = (page - 1) * limit
  const searchPattern = `%${escapeLikePattern(search ?? '')}%`

  const scopedBaseQuery = db
    .selectFrom('user')
    .where('user._deleted', '=', false)
    .$if(!hasUnscopedRead, queryBuilder => queryBuilder.where(eb => {
      const visibleUserConditions = [eb('user.id', '=', auth.userId)]
      if (agencyIds.length > 0) {
        visibleUserConditions.push(
          eb('user.id', 'in', db
            .selectFrom('user_role_assignment')
            .innerJoin('role', 'role.id', 'user_role_assignment.role_id')
            .where('user_role_assignment._deleted', '=', false)
            .where('role.id', 'in', selectActiveStructuralRoleIds(db))
            .where('role.agency_id', 'in', agencyIds)
            .select('user_role_assignment.user_id'))
        )
      }

      return eb.or(visibleUserConditions)
    }))

  const filteredQuery = scopedBaseQuery.$if(Boolean(search), queryBuilder => queryBuilder.where(eb => eb.or([
    eb('user.name', 'ilike', searchPattern),
    eb('user.email', 'ilike', searchPattern)
  ])))

  const statsQuery = hasUnscopedRead
    ? db.selectFrom('user').where('user._deleted', '=', false)
    : scopedBaseQuery

  const [items, countResult, statsResult] = await Promise.all([
    filteredQuery
      .select(['user.id', 'user.name', 'user.email', 'user.image', 'user.emailVerified'])
      .orderBy('user.id', 'asc')
      .limit(limit)
      .offset(offset)
      .execute(),
    filteredQuery.select(eb => eb.fn.count('user.id').as('total')).executeTakeFirst(),
    statsQuery
      .select([
        eb => eb.fn.count('user.id').as('total'),
        eb => eb.fn.count(eb.case().when('emailVerified', '=', true).then(1).else(null).end()).as('active')
      ])
      .executeTakeFirst()
  ])

  const [updateAccess, deleteAccess] = await Promise.all([
    resolveAuthorizedAgencyAccess(auth, 'user', 'update', db),
    resolveAuthorizedAgencyAccess(auth, 'user', 'delete', db)
  ])
  const canActivateUsers = updateAccess.hasGlobalAccess
  const inactiveUserIds = items
    .filter(item => item.emailVerified === false)
    .map(item => String(item.id))
  const accountRows = inactiveUserIds.length === 0
    ? []
    : await db
        .selectFrom('account')
        .where('userId', 'in', inactiveUserIds)
        .select('userId')
        .execute()
  const usersWithAccounts = new Set(accountRows.map(account => String(account.userId)))

  const needsTargetScopes = !updateAccess.hasGlobalAccess || !deleteAccess.hasGlobalAccess
  const targetScopes = new Map<string, { agencyIds: Set<string>, hasGlobalRole: boolean }>()
  const userIds = items.map(item => String(item.id))

  if (needsTargetScopes && userIds.length > 0) {
    const managementScopes = await getActiveUserManagementScopes(db, userIds)

    for (const scope of managementScopes) {
      targetScopes.set(scope.userId, {
        agencyIds: new Set(scope.agencyIds),
        hasGlobalRole: scope.hasGlobalRole
      })
    }
  }

  const canAccessUser = (
    userId: string,
    access: typeof updateAccess
  ): boolean => {
    if (access.hasGlobalAccess) return true
    const targetScope = targetScopes.get(userId)
    return Boolean(
      targetScope
      && !targetScope.hasGlobalRole
      && targetScope.agencyIds.size > 0
      && [...targetScope.agencyIds].every(agencyId => access.agencyIds.includes(agencyId))
    )
  }

  const userItems: UserListItem[] = items.map(item => {
    const userId = String(item.id)
    return {
      ...item,
      can_activate: canActivateUsers
        && item.emailVerified === false
        && !usersWithAccounts.has(userId),
      can_update: canAccessUser(userId, updateAccess),
      can_delete: canAccessUser(userId, deleteAccess)
    }
  })

  return {
    items: userItems,
    total: Number(countResult?.total ?? 0),
    stats: {
      total: Number(statsResult?.total ?? 0),
      active: Number(statsResult?.active ?? 0)
    },
    page,
    limit
  }
})
