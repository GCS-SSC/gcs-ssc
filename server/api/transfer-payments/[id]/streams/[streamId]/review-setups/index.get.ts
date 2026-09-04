/* eslint-disable jsdoc/require-jsdoc */
import { PaginationSchema } from '~~/shared/types/schemas'
import { REVIEW_TYPE_ENUM } from '~~/shared/constants/enums'
import { z } from 'zod'
import { authorize } from '~~/server/utils/authorize'
import { createTransferPaymentScopedAuthorizeHandler, authorizeTransferPaymentStreamResource } from '~~/server/utils/transfer-payment-route-authorization'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { groupReviewSetupMembers, mapReviewSetupMembers } from '~~/server/utils/transfer-payment-polymorphic'
import type { ReviewSetupMemberRow } from '~~/server/utils/transfer-payment-polymorphic'
import type { H3Event } from 'h3'
import type { Kysely, Selectable } from 'kysely'
import type { CommonReviewSetSetupTable, Database } from '~~/shared/types/database'
import type { PublicationState } from '~~/shared/constants/system-lifecycle'
import { readReviewSetupPublicationMetadata } from '~~/server/utils/review-setup-versioning'

const IN_FILTER_CHUNK_SIZE = 500
type ReviewType = (typeof REVIEW_TYPE_ENUM)[number]
export const ReviewSetupListQuerySchema = PaginationSchema.extend({
  reviewType: z.enum(REVIEW_TYPE_ENUM, { error: 'validation.invalid_selection' }).optional()
}).strict()
type QueryWithWhere = { where: (...args: unknown[]) => unknown }
type InFilterExpressionBuilder = { or: (conditions: unknown[]) => unknown } & ((
  column: string,
  operator: 'in',
  values: string[]
) => unknown)
type SearchExpressionBuilder = { or: (conditions: unknown[]) => unknown } & ((
  column: string,
  operator: 'ilike',
  value: string
) => unknown)
type ReviewSetupListRow = Selectable<CommonReviewSetSetupTable>
  & {
    entityTypeLabelEn: string
    entityTypeLabelFr: string
    publicationState: PublicationState
    publicationVersionId: string | null
    publicationVersion: number | null
  }
type ReviewSetupCountResult = {
  total?: number | string | bigint | null
  published?: number | string | bigint | null
}
type ReviewSetupBaseQuery = ReturnType<typeof createReviewSetupBaseQuery>

/**
 * Applies chunked `IN` predicates to avoid oversized parameter lists.
 *
 * @param query - Query builder.
 * @param column - Column to filter.
 * @param values - Filter values.
 * @returns Updated query builder.
 */
const applyChunkedInFilter = <TQuery>(
  query: TQuery,
  column: string,
  values: string[]
): TQuery => {
  if (values.length === 0) {
    return query
  }

  if (values.length <= IN_FILTER_CHUNK_SIZE) {
    return (query as TQuery & QueryWithWhere).where(column, 'in', values) as TQuery
  }

  const chunks: string[][] = []
  for (let index = 0; index < values.length; index += IN_FILTER_CHUNK_SIZE) {
    chunks.push(values.slice(index, index + IN_FILTER_CHUNK_SIZE))
  }

  return (query as TQuery & QueryWithWhere).where((eb: InFilterExpressionBuilder) =>
    eb.or(chunks.map(chunk => eb(column, 'in', chunk)))
  ) as TQuery
}

const readReviewSetupListRouteParams = async (event: H3Event) => {
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')

  if (!profileId || !streamId) {
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  }

  return { profileId, streamId }
}

const authorizeReviewSetupListRoute = async (
  event: H3Event,
  db: Kysely<Database>,
  profileId: string,
  streamId: string
) => {
  const streamContext = await authorizeTransferPaymentStreamResource(event, 'read', profileId, streamId)
  if (!streamContext) {
    return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }

  await authorize(event, 'transfer_payment', 'read', createTransferPaymentScopedAuthorizeHandler('read', streamContext.scope, db))
}

const readReviewSetupListQuery = async (event: H3Event) => {
  return await getValidatedQueryI18n(event, ReviewSetupListQuerySchema)
}

const createReviewSetupBaseQuery = (
  db: Kysely<Database>,
  streamId: string
) => db
  .selectFrom('Common_Review_Set_Setup')
  .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Review_Set_Setup.id')
  .innerJoin('Common_Entity_Type', 'Common_Entity_Type.egcs_cn_type', 'Common_Review_Set_Setup.egcs_cn_entitytype')
  .leftJoin('Common_Publication_Version', 'Common_Publication_Version.id', 'Common_Publication.egcs_cn_currentversion')
  .where('Common_Review_Set_Setup.egcs_cn_scopetype', '=', 'transferpaymentstream')
  .where('Common_Review_Set_Setup.egcs_cn_scopeid', '=', streamId)
  .where('Common_Review_Set_Setup._deleted', '=', false)
  .where('Common_Publication._deleted', '=', false)

const getReviewSetupIdsByType = async (
  db: Kysely<Database>,
  streamId: string,
  reviewType: ReviewType
) => {
  const matchingSetIds = await db
    .selectFrom('Common_Review_Setup')
    .innerJoin(
      'Common_Review_Set_Setup',
      'Common_Review_Set_Setup.id',
      'Common_Review_Setup.egcs_cn_reviewset'
    )
    .innerJoin('Common_Review_Schema', 'Common_Review_Schema.id', 'Common_Review_Setup.egcs_cn_reviewschema')
    .select('Common_Review_Setup.egcs_cn_reviewset as reviewset')
    .where('Common_Review_Set_Setup.egcs_cn_scopetype', '=', 'transferpaymentstream')
    .where('Common_Review_Set_Setup.egcs_cn_scopeid', '=', streamId)
    .where('Common_Review_Set_Setup._deleted', '=', false)
    .where('Common_Review_Setup._deleted', '=', false)
    .where('Common_Review_Schema._deleted', '=', false)
    .where('Common_Review_Schema.egcs_cn_reviewtype', '=', reviewType)
    .execute()

  return Array.from(new Set(matchingSetIds.map(item => String(item.reviewset))))
}

const applyReviewSetupSearchFilter = (
  query: ReviewSetupBaseQuery,
  search: string | undefined
): ReviewSetupBaseQuery => {
  if (search) {
    const escapedSearch = escapeLikePattern(search)
    return (query as ReviewSetupBaseQuery & QueryWithWhere).where((eb: SearchExpressionBuilder) => eb.or([
      eb('Common_Review_Set_Setup.egcs_cn_name_en', 'ilike', `%${escapedSearch}%`),
      eb('Common_Review_Set_Setup.egcs_cn_name_fr', 'ilike', `%${escapedSearch}%`)
    ])) as ReviewSetupBaseQuery
  }

  return query
}

const applyReviewSetupTypeFilter = async (
  db: Kysely<Database>,
  streamId: string,
  query: ReviewSetupBaseQuery,
  reviewType: ReviewType | undefined
) => {
  if (!reviewType) {
    return { query, hasMatches: true }
  }

  const reviewSetIds = await getReviewSetupIdsByType(db, streamId, reviewType)
  if (reviewSetIds.length === 0) {
    return { query, hasMatches: false }
  }

  return {
    query: applyChunkedInFilter(query, 'Common_Review_Set_Setup.id', reviewSetIds),
    hasMatches: true
  }
}

const fetchReviewSetupListPage = async (
  query: ReviewSetupBaseQuery,
  limit: number,
  offset: number
): Promise<[ReviewSetupListRow[], ReviewSetupCountResult | undefined]> => {
  return await Promise.all([
    query.selectAll('Common_Review_Set_Setup').select([
      'Common_Entity_Type.egcs_cn_label_en as entityTypeLabelEn',
      'Common_Entity_Type.egcs_cn_label_fr as entityTypeLabelFr',
      'Common_Publication.egcs_cn_state as publicationState',
      'Common_Publication.egcs_cn_currentversion as publicationVersionId',
      'Common_Publication_Version.egcs_cn_version as publicationVersion'
    ]).orderBy('Common_Review_Set_Setup.id', 'asc').limit(limit).offset(offset).execute(),
    query.select(eb => [
      eb.fn.count('Common_Review_Set_Setup.id').as('total'),
      eb.fn.count('Common_Review_Set_Setup.id').filterWhere('Common_Publication.egcs_cn_state', '=', 'published').as('published')
    ]).executeTakeFirst()
  ])
}

const fetchReviewSetupMembers = async (
  db: Kysely<Database>,
  setIds: string[]
): Promise<ReviewSetupMemberRow[]> => {
  if (setIds.length === 0) {
    return []
  }

  return await db
    .selectFrom('Common_Review_Setup')
    .innerJoin('Common_Review_Schema', 'Common_Review_Schema.id', 'Common_Review_Setup.egcs_cn_reviewschema')
    .innerJoin('Common_Publication as Review_Schema_Publication', 'Review_Schema_Publication.id', 'Common_Review_Schema.id')
    .leftJoin('Common_Publication_Version as Review_Schema_Version', 'Review_Schema_Version.id', 'Review_Schema_Publication.egcs_cn_currentversion')
    .select([
      'Common_Review_Setup.id',
      'Common_Review_Setup.egcs_cn_reviewset',
      'Common_Review_Setup.egcs_cn_reviewschema',
      'Common_Review_Setup.egcs_cn_order',
      'Common_Review_Setup.egcs_cn_approvaltemplate',
      'Common_Review_Setup.egcs_cn_failonchecklistfailure',
      'Common_Review_Setup.egcs_cn_failurethreshold',
      'Common_Review_Schema.egcs_cn_name_en as egcs_cn_name_en',
      'Common_Review_Schema.egcs_cn_reviewtype as egcs_cn_reviewtype',
      'Common_Review_Schema.egcs_cn_name_fr as egcs_cn_name_fr',
      'Common_Review_Schema.egcs_cn_outcomename_en as egcs_cn_outcomename_en',
      'Common_Review_Schema.egcs_cn_outcomename_fr as egcs_cn_outcomename_fr',
      'Common_Review_Schema.egcs_cn_disablecustomoutcomes as egcs_cn_disablecustomoutcomes',
      'Common_Review_Schema.egcs_cn_disablealignment as egcs_cn_disablealignment',
      'Common_Review_Schema.egcs_cn_disablereviewers as egcs_cn_disablereviewers',
      'Review_Schema_Publication.id as publicationId',
      'Review_Schema_Publication.egcs_cn_state as publicationState',
      'Review_Schema_Publication.egcs_cn_currentversion as publicationVersionId',
      'Review_Schema_Version.egcs_cn_version as publicationVersion',
      'Common_Review_Setup._deleted'
    ])
    .where('Common_Review_Setup.egcs_cn_reviewset', 'in', setIds)
    .where('Common_Review_Setup._deleted', '=', false)
    .where('Common_Review_Schema._deleted', '=', false)
    .orderBy('Common_Review_Setup.egcs_cn_order', 'asc')
    .execute()
}

const mapReviewSetupListItems = async (
  db: Kysely<Database>,
  items: ReviewSetupListRow[],
  members: ReviewSetupMemberRow[]
) => {
  const membersBySetId = groupReviewSetupMembers(members)

  return await Promise.all(items.map(async item => {
    const setMembers = membersBySetId.get(String(item.id)) ?? []

    return {
      id: String(item.id),
      egcs_cn_entitytype: item.egcs_cn_entitytype,
      entityTypeLabelEn: item.entityTypeLabelEn,
      entityTypeLabelFr: item.entityTypeLabelFr,
      egcs_cn_name_en: item.egcs_cn_name_en,
      egcs_cn_name_fr: item.egcs_cn_name_fr,
      egcs_cn_order: item.egcs_cn_order,
      egcs_cn_sequential: item.egcs_cn_sequential,
      egcs_cn_approvaltemplate: item.egcs_cn_approvaltemplate ? String(item.egcs_cn_approvaltemplate) : null,
      publicationId: String(item.id),
      publicationState: item.publicationState,
      publicationVersionId: item.publicationVersionId === null ? null : String(item.publicationVersionId),
      publicationVersion: item.publicationVersion === null ? null : Number(item.publicationVersion),
      hasUnpublishedChanges: (await readReviewSetupPublicationMetadata(db, item)).hasUnpublishedChanges,
      _deleted: item._deleted,
      members: mapReviewSetupMembers(setMembers)
    }
  }))
}

const createEmptyReviewSetupListResponse = (
  page: number,
  limit: number
) => ({ items: [], total: 0, stats: { total: 0, published: 0 }, page, limit })

export default defineEventHandler(async event => {
  const db = event.context.$db
  const routeParams = await readReviewSetupListRouteParams(event)
  if (!('profileId' in routeParams)) {
    return routeParams
  }

  const { profileId, streamId } = routeParams
  const { page, limit, search, reviewType } = await readReviewSetupListQuery(event)
  const authorizationResult = await authorizeReviewSetupListRoute(event, db, profileId, streamId)
  if (authorizationResult) {
    return authorizationResult
  }

  const offset = (page - 1) * limit

  let baseQuery = createReviewSetupBaseQuery(db, streamId)
  const typeFilterResult = await applyReviewSetupTypeFilter(db, streamId, baseQuery, reviewType)
  if (!typeFilterResult.hasMatches) {
    return createEmptyReviewSetupListResponse(page, limit)
  }
  baseQuery = applyReviewSetupSearchFilter(typeFilterResult.query, search)

  const [items, countResult] = await fetchReviewSetupListPage(baseQuery, limit, offset)

  const setIds = items.map(item => String(item.id))
  const members = await fetchReviewSetupMembers(db, setIds)
  const mappedItems = await mapReviewSetupListItems(db, items, members)

  const total = Number(countResult?.total ?? 0)
  const published = Number(countResult?.published ?? 0)

  return {
    items: mappedItems,
    total,
    stats: { total, published },
    page,
    limit
  }
})
