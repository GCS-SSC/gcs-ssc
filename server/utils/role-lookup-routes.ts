/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns -- Lookup query helpers are covered by focused route and query tests. */
import { sql } from 'kysely'
import type { Kysely } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { escapeLikePattern } from './sql-like'

interface RoleLookupListQuery {
  page: number
  limit: number
  search?: string
}

const emptyRoleLookupListResponse = (page: number, limit: number) => ({
  items: [],
  total: 0,
  page,
  limit
})

const buildRoleLookupListResponse = <Item>(
  items: Item[],
  countResult: { total?: string | number | bigint | null } | undefined,
  page: number,
  limit: number
) => {
  const total = countResult?.total
  return {
    items,
    total: total === undefined || total === null ? 0 : Number(total),
    page,
    limit
  }
}

/** Lists only agency identifiers and bilingual labels authorized for role scope selection. */
export const listRoleLookupAgencies = async (
  db: Kysely<Database>,
  agencyIds: string[] | null,
  queryInput: RoleLookupListQuery
) => {
  const { page, limit, search } = queryInput
  if (agencyIds !== null && agencyIds.length === 0) {
    return emptyRoleLookupListResponse(page, limit)
  }

  let query = db
    .selectFrom('Agency_Profile')
    .where('Agency_Profile._deleted', '=', false)

  if (agencyIds !== null) {
    query = query.where('Agency_Profile.id', 'in', agencyIds)
  }

  if (search !== undefined && search.length > 0) {
    const pattern = `%${escapeLikePattern(search)}%`
    query = query.where(eb => eb.or([
      eb('Agency_Profile.egcs_ay_name_en', 'ilike', pattern),
      eb('Agency_Profile.egcs_ay_name_fr', 'ilike', pattern),
      eb(sql<string>`CAST(${sql.ref('Agency_Profile.id')} AS TEXT)`, 'ilike', pattern)
    ]))
  }

  const offset = (page - 1) * limit
  const [items, countResult] = await Promise.all([
    query
      .select([
        'Agency_Profile.id as id',
        'Agency_Profile.egcs_ay_name_en as egcs_ay_name_en',
        'Agency_Profile.egcs_ay_name_fr as egcs_ay_name_fr'
      ])
      .orderBy('Agency_Profile.id', 'asc')
      .limit(limit)
      .offset(offset)
      .execute(),
    query
      .select(eb => eb.fn.count('Agency_Profile.id').as('total'))
      .executeTakeFirst()
  ])

  return buildRoleLookupListResponse(items, countResult, page, limit)
}

/** Lists only transfer-payment identifiers, ownership, and bilingual labels for role scope selection. */
export const listRoleLookupTransferPayments = async (
  db: Kysely<Database>,
  agencyId: string,
  queryInput: RoleLookupListQuery
) => {
  const { page, limit, search } = queryInput
  let query = db
    .selectFrom('Transfer_Payment_Profile')
    .innerJoin(
      'Agency_Profile',
      'Agency_Profile.id',
      'Transfer_Payment_Profile.egcs_tp_agency'
    )
    .where('Transfer_Payment_Profile.egcs_tp_agency', '=', agencyId)
    .where('Transfer_Payment_Profile._deleted', '=', false)
    .where('Agency_Profile._deleted', '=', false)

  if (search !== undefined && search.length > 0) {
    const pattern = `%${escapeLikePattern(search)}%`
    query = query.where(eb => eb.or([
      eb('Transfer_Payment_Profile.egcs_tp_name_en', 'ilike', pattern),
      eb('Transfer_Payment_Profile.egcs_tp_name_fr', 'ilike', pattern),
      eb(sql<string>`CAST(${sql.ref('Transfer_Payment_Profile.id')} AS TEXT)`, 'ilike', pattern)
    ]))
  }

  const offset = (page - 1) * limit
  const [items, countResult] = await Promise.all([
    query
      .select([
        'Transfer_Payment_Profile.id as id',
        'Transfer_Payment_Profile.egcs_tp_agency as egcs_tp_agency',
        'Transfer_Payment_Profile.egcs_tp_name_en as egcs_tp_name_en',
        'Transfer_Payment_Profile.egcs_tp_name_fr as egcs_tp_name_fr'
      ])
      .orderBy('Transfer_Payment_Profile.id', 'asc')
      .limit(limit)
      .offset(offset)
      .execute(),
    query
      .select(eb => eb.fn.count('Transfer_Payment_Profile.id').as('total'))
      .executeTakeFirst()
  ])

  return buildRoleLookupListResponse(items, countResult, page, limit)
}
