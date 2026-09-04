import { sql } from 'kysely'
import type { Kysely } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { TransferPaymentListQuery } from '~~/shared/types/schemas'
import type { TransferPaymentVisibility } from './authorize'
import { buildListRouteResponse, emptyListRouteResponse } from './list-route-response'
import { escapeLikePattern } from './sql-like'

/**
 * Lists visible transfer payments with filtered pagination and visibility-scoped statistics.
 *
 * @param db - Database connection.
 * @param visibility - Resolved transfer-payment visibility.
 * @param listQuery - Validated pagination and user filters.
 * @returns Paginated transfer payments, filtered count, and visibility-scoped statistics.
 */
export const listTransferPayments = async (
  db: Kysely<Database>,
  visibility: TransferPaymentVisibility | undefined,
  listQuery: TransferPaymentListQuery
) => {
  const { page, limit, search, status, agency_id } = listQuery

  if (visibility === undefined || visibility.access === 'none') {
    return emptyListRouteResponse(page, limit)
  }

  let scopedQuery = db
    .selectFrom('Transfer_Payment_Profile')
    .innerJoin('Agency_Profile', 'Agency_Profile.id', 'Transfer_Payment_Profile.egcs_tp_agency')
    .where('Transfer_Payment_Profile._deleted', '=', false)
    .where('Agency_Profile._deleted', '=', false)

  if (visibility.access === 'scoped') {
    const { agencyIds, transferPaymentIds } = visibility

    if (agencyIds.length === 0 && transferPaymentIds.length === 0) {
      return emptyListRouteResponse(page, limit)
    }

    if (agencyIds.length > 0 && transferPaymentIds.length > 0) {
      scopedQuery = scopedQuery.where(eb =>
        eb.or([
          eb('Transfer_Payment_Profile.egcs_tp_agency', 'in', agencyIds),
          eb('Transfer_Payment_Profile.id', 'in', transferPaymentIds)
        ])
      )
    } else if (agencyIds.length > 0) {
      scopedQuery = scopedQuery.where('Transfer_Payment_Profile.egcs_tp_agency', 'in', agencyIds)
    } else {
      scopedQuery = scopedQuery.where('Transfer_Payment_Profile.id', 'in', transferPaymentIds)
    }
  }

  const statsQuery = scopedQuery
  let filteredQuery = scopedQuery

  if (agency_id !== undefined) {
    filteredQuery = filteredQuery.where('Transfer_Payment_Profile.egcs_tp_agency', '=', agency_id)
  }

  if (status !== 'all') {
    filteredQuery = filteredQuery.where('Transfer_Payment_Profile.egcs_tp_active', '=', status === 'active')
  }

  if (search !== undefined && search.length > 0) {
    const pattern = `%${escapeLikePattern(search)}%`
    filteredQuery = filteredQuery.where(eb =>
      eb.or([
        eb('Transfer_Payment_Profile.egcs_tp_name_en', 'ilike', pattern),
        eb('Transfer_Payment_Profile.egcs_tp_name_fr', 'ilike', pattern),
        eb('Transfer_Payment_Profile.egcs_tp_abbreviation_en', 'ilike', pattern),
        eb('Transfer_Payment_Profile.egcs_tp_abbreviation_fr', 'ilike', pattern),
        eb('Agency_Profile.egcs_ay_name_en', 'ilike', pattern),
        eb('Agency_Profile.egcs_ay_name_fr', 'ilike', pattern),
        eb(sql<string>`CAST(${sql.ref('Transfer_Payment_Profile.id')} AS TEXT)`, 'ilike', pattern)
      ])
    )
  }

  const offset = (page - 1) * limit
  const [items, countResult, statsResult] = await Promise.all([
    filteredQuery
      .select([
        'Transfer_Payment_Profile.id as id',
        'Transfer_Payment_Profile.egcs_tp_agency as egcs_tp_agency',
        'Transfer_Payment_Profile.egcs_tp_datestart as egcs_tp_datestart',
        'Transfer_Payment_Profile.egcs_tp_dateend as egcs_tp_dateend',
        'Transfer_Payment_Profile.egcs_tp_name_en as egcs_tp_name_en',
        'Transfer_Payment_Profile.egcs_tp_name_fr as egcs_tp_name_fr',
        'Transfer_Payment_Profile.egcs_tp_abbreviation_en as egcs_tp_abbreviation_en',
        'Transfer_Payment_Profile.egcs_tp_abbreviation_fr as egcs_tp_abbreviation_fr',
        'Transfer_Payment_Profile.egcs_tp_description_en as egcs_tp_description_en',
        'Transfer_Payment_Profile.egcs_tp_description_fr as egcs_tp_description_fr',
        'Transfer_Payment_Profile.egcs_tp_purpose_en as egcs_tp_purpose_en',
        'Transfer_Payment_Profile.egcs_tp_purpose_fr as egcs_tp_purpose_fr',
        'Transfer_Payment_Profile.egcs_tp_tclink as egcs_tp_tclink',
        'Transfer_Payment_Profile.egcs_tp_active as egcs_tp_active',
        'Agency_Profile.egcs_ay_name_en as agency_name_en',
        'Agency_Profile.egcs_ay_name_fr as agency_name_fr'
      ])
      .orderBy('Transfer_Payment_Profile.id', 'asc')
      .limit(limit)
      .offset(offset)
      .execute(),
    filteredQuery
      .select(eb => eb.fn.count('Transfer_Payment_Profile.id').as('total'))
      .executeTakeFirst(),
    statsQuery
      .select([
        eb => eb.fn.count('Transfer_Payment_Profile.id').as('total'),
        eb =>
          eb.fn
            .count(
              eb.case()
                .when('Transfer_Payment_Profile.egcs_tp_active', '=', true)
                .then(1)
                .else(null)
                .end()
            )
            .as('active')
      ])
      .executeTakeFirst()
  ])

  return buildListRouteResponse(items, countResult, statsResult, page, limit)
}
