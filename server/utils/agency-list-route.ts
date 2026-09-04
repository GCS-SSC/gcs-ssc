/* eslint-disable jsdoc/require-jsdoc -- Agency list helpers expose typed contracts covered by route tests. */
import { sql } from 'kysely'
import type { ExpressionBuilder, Kysely } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { buildListRouteResponse, emptyListRouteResponse } from './list-route-response'
import { escapeLikePattern } from './sql-like'

type AgencyListAuthContext = {
  agencyIds?: string[]
  hasGlobalAccess?: boolean
}

type AgencyListQuery = {
  page: number
  limit: number
  search?: string
  status?: string
}

type AgencyExpressionBuilder = ExpressionBuilder<Database, 'Agency_Profile'>

const hasUnscopedAgencyRead = (authContext: AgencyListAuthContext) =>
  authContext.hasGlobalAccess === true

const applyAgencyListFilters = <Query extends {
  where: (...args: unknown[]) => Query
}>(
  baseQuery: Query,
  search: string | undefined,
  status: AgencyListQuery['status']
) => {
  let query = baseQuery

  if (status === 'active' || status === 'inactive') {
    query = query.where('egcs_ay_active', '=', status === 'active')
  }

  if (search) {
    const escapedSearch = escapeLikePattern(search)
    query = query.where((eb: AgencyExpressionBuilder) =>
      eb.or([
        eb('egcs_ay_name_en', 'ilike', `%${escapedSearch}%`),
        eb('egcs_ay_name_fr', 'ilike', `%${escapedSearch}%`),
        eb('egcs_ay_abbreviation_en', 'ilike', `%${escapedSearch}%`),
        eb('egcs_ay_abbreviation_fr', 'ilike', `%${escapedSearch}%`),
        eb(sql<string>`CAST(egcs_ay_gwcoa_number AS TEXT)`, 'ilike', `%${escapedSearch}%`),
        eb(sql<string>`CAST(egcs_ay_agencyfinancialsystemid AS TEXT)`, 'ilike', `%${escapedSearch}%`)
      ])
    )
  }

  return query
}

const listAgenciesForRouteInSnapshot = async (
  db: Kysely<Database>,
  authContext: AgencyListAuthContext,
  queryInput: AgencyListQuery
) => {
  const { page, limit, search, status } = queryInput
  const offset = (page - 1) * limit
  const agencyIds = authContext.agencyIds ?? []
  const hasUnscopedRead = hasUnscopedAgencyRead(authContext)

  let scopedBaseQuery = db.selectFrom('Agency_Profile').where('_deleted', '=', false)
  if (!hasUnscopedRead) {
    if (agencyIds.length === 0) {
      return emptyListRouteResponse(page, limit)
    }

    scopedBaseQuery = scopedBaseQuery.where('id', 'in', agencyIds)
  }

  const baseQuery = applyAgencyListFilters(scopedBaseQuery, search, status)
  const statsQuery = hasUnscopedRead ? db.selectFrom('Agency_Profile').where('_deleted', '=', false) : scopedBaseQuery

  const [items, countResult, statsResult] = await Promise.all([
    baseQuery.selectAll().orderBy('id', 'asc').limit(limit).offset(offset).execute(),
    baseQuery.select(eb => eb.fn.count('id').as('total')).executeTakeFirst(),
    statsQuery
      .select([
        eb => eb.fn.count('id').as('total'),
        eb => eb.fn.count(eb.case().when('egcs_ay_active', '=', true).then(1).else(null).end()).as('active')
      ])
      .executeTakeFirst()
  ])

  return buildListRouteResponse(items, countResult, statsResult, page, limit)
}

export const listAgenciesForRoute = async (
  db: Kysely<Database>,
  authContext: AgencyListAuthContext,
  queryInput: AgencyListQuery
) => await db.transaction()
  .setIsolationLevel('repeatable read')
  .setAccessMode('read only')
  .execute(async trx => await listAgenciesForRouteInSnapshot(
    trx as unknown as Kysely<Database>, authContext, queryInput
  ))
