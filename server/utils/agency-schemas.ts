import { escapeLikePattern } from '~~/server/utils/sql-like'
import type { REVIEW_TYPE_ENUM } from '~~/shared/constants/enums'
import type { ExecutionEntityType } from '~~/shared/types/schemas'
import type { Database } from '~~/shared/types/database'
import type { Kysely, Transaction } from 'kysely'

type AgencyReviewType = typeof REVIEW_TYPE_ENUM[number]

type AgencySchemaListParams = {
  db: Kysely<Database> | Transaction<Database>
  reviewType?: AgencyReviewType
  entityType?: ExecutionEntityType
  agencyId: string
  search?: string
  page: number
  limit: number
  offset: number
}

/**
 * Fetches paginated agency-scoped schema rows with optional bilingual name search.
 *
 * @param params - Query parameters.
 * @param params.db - Kysely database instance.
 * @param params.reviewType - Review type used to scope schema rows.
 * @param params.agencyId - Agency id used to scope results.
 * @param params.search - Optional search term for bilingual names.
 * @param params.page - Current page number.
 * @param params.limit - Page size.
 * @param params.offset - Pagination offset.
 * @returns The paginated list response and active-row statistics.
 */
const fetchAgencySchemasInSnapshot = async (params: AgencySchemaListParams) => {
  const {
    db,
    reviewType,
    entityType,
    agencyId,
    search,
    page,
    limit,
    offset
  } = params

  const scopedQuery = db
    .selectFrom('Common_Review_Schema')
    .where('egcs_cn_agency', '=', agencyId)
    .where('_deleted', '=', false)

  let baseQuery = scopedQuery

  if (reviewType) {
    baseQuery = baseQuery.where('egcs_cn_reviewtype', '=', reviewType)
  }

  if (entityType) {
    baseQuery = baseQuery.where('egcs_cn_entitytype', '=', entityType)
  }

  if (search) {
    const escapedSearch = escapeLikePattern(search)
    baseQuery = baseQuery.where(eb =>
      eb.or([
        eb('egcs_cn_name_en', 'ilike', `%${escapedSearch}%`),
        eb('egcs_cn_name_fr', 'ilike', `%${escapedSearch}%`)
      ])
    )
  }

  const [items, countResult, statsResult] = await Promise.all([
    baseQuery.selectAll().orderBy('id', 'asc').limit(limit).offset(offset).execute(),
    baseQuery.select(eb => eb.fn.count('id').as('total')).executeTakeFirst(),
    scopedQuery.select(eb => eb.fn.count('id').as('total')).executeTakeFirst()
  ])

  const total = Number(countResult?.total || 0)
  const statsTotal = Number(statsResult?.total || 0)

  return {
    items,
    total,
    stats: {
      total: statsTotal,
      active: statsTotal
    },
    page,
    limit
  }
}

/**
 * Reads an Agency schema page, total, and statistics from one consistent snapshot.
 * @param params Agency schema query parameters.
 * @returns Consistent schema page response.
 */
export const fetchAgencySchemas = async (params: AgencySchemaListParams) => (
  params.db.isTransaction || typeof (params.db as Kysely<Database>).transaction !== 'function'
)
  ? await fetchAgencySchemasInSnapshot(params)
  : await params.db.transaction()
      .setIsolationLevel('repeatable read')
      .setAccessMode('read only')
      .execute(async trx => await fetchAgencySchemasInSnapshot({ ...params, db: trx }))
