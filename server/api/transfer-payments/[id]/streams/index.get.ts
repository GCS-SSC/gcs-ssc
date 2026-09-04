/* eslint-disable jsdoc/require-jsdoc -- Transfer-payment stream route behavior is covered by focused tests. */
import type { ExpressionBuilder, Kysely } from 'kysely'
import { TransferPaymentListQuerySchema } from '~~/shared/types/schemas'
import type { Database } from '~~/shared/types/database'
import { buildListRouteResponse } from '~~/server/utils/list-route-response'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { authorizeTransferPaymentProfileResource } from '~~/server/utils/transfer-payment-route-authorization'

type StreamListQuery = {
  page: number
  limit: number
  search?: string
  status?: string
}

type StreamExpressionBuilder = ExpressionBuilder<Database, 'Transfer_Payment_Stream'>

const applyStreamListFilters = <Query extends {
  where: (...args: unknown[]) => Query
}>(
  baseQuery: Query,
  search: string | undefined,
  status: string | undefined
) => {
  let query = baseQuery

  if (status && status !== 'all') {
    query = query.where('Transfer_Payment_Stream.egcs_tp_active', '=', status === 'active')
  }

  if (search) {
    const pattern = `%${escapeLikePattern(search)}%`
    query = query.where((eb: StreamExpressionBuilder) =>
      eb.or([
        eb('Transfer_Payment_Stream.egcs_tp_name_en', 'ilike', pattern),
        eb('Transfer_Payment_Stream.egcs_tp_name_fr', 'ilike', pattern),
        eb('Transfer_Payment_Stream.egcs_tp_abbreviation_en', 'ilike', pattern),
        eb('Transfer_Payment_Stream.egcs_tp_abbreviation_fr', 'ilike', pattern)
      ])
    )
  }

  return query
}

const listTransferPaymentStreams = async (
  db: Kysely<Database>,
  profileId: string,
  queryInput: StreamListQuery
) => {
  const { page, limit, search, status } = queryInput
  const offset = (page - 1) * limit

  const baseQuery = applyStreamListFilters(
    db
      .selectFrom('Transfer_Payment_Stream')
      .leftJoin('Transfer_Payment_Stream as parent', 'parent.id', 'Transfer_Payment_Stream.egcs_tp_parentstream')
      .where('Transfer_Payment_Stream.egcs_tp_transferpaymentprofile', '=', profileId)
      .where('Transfer_Payment_Stream._deleted', '=', false),
    search,
    status
  )

  const [items, countResult, statsResult] = await Promise.all([
    baseQuery
      .select([
        'Transfer_Payment_Stream.id as id',
        'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile as egcs_tp_transferpaymentprofile',
        'Transfer_Payment_Stream.egcs_tp_parentstream as egcs_tp_parentstream',
        'Transfer_Payment_Stream.egcs_tp_name_en as egcs_tp_name_en',
        'Transfer_Payment_Stream.egcs_tp_name_fr as egcs_tp_name_fr',
        'Transfer_Payment_Stream.egcs_tp_description_en as egcs_tp_description_en',
        'Transfer_Payment_Stream.egcs_tp_description_fr as egcs_tp_description_fr',
        'Transfer_Payment_Stream.egcs_tp_abbreviation_en as egcs_tp_abbreviation_en',
        'Transfer_Payment_Stream.egcs_tp_abbreviation_fr as egcs_tp_abbreviation_fr',
        'Transfer_Payment_Stream.egcs_tp_objective_en as egcs_tp_objective_en',
        'Transfer_Payment_Stream.egcs_tp_objective_fr as egcs_tp_objective_fr',
        'Transfer_Payment_Stream.egcs_tp_allowsfurtherdistribution as egcs_tp_allowsfurtherdistribution',
        'Transfer_Payment_Stream.egcs_tp_active as egcs_tp_active',
        'parent.egcs_tp_name_en as parent_name_en',
        'parent.egcs_tp_name_fr as parent_name_fr'
      ])
      .orderBy('Transfer_Payment_Stream.id', 'asc')
      .limit(limit)
      .offset(offset)
      .execute(),
    baseQuery.select(eb => eb.fn.count('Transfer_Payment_Stream.id').as('total')).executeTakeFirst(),
    baseQuery
      .select([
        eb => eb.fn.count('Transfer_Payment_Stream.id').as('total'),
        eb =>
          eb.fn
            .count(eb.case().when('Transfer_Payment_Stream.egcs_tp_active', '=', true).then(1).else(null).end())
            .as('active')
      ])
      .executeTakeFirst()
  ])

  return buildListRouteResponse(items, countResult, statsResult, page, limit)
}

/**
 *  * Event handler for this server API route. Handles the incoming request payload, performs necessary business logic and authorization operations, and returns the expected endpoint response array or object.
 *  *
 *  * @param event - The active H3 event context encapsulating the request and response objects.
 *
 */
export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  if (!profileId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }

  const profileAccess = await authorizeTransferPaymentProfileResource(event, 'read', profileId)
  if (!profileAccess) {
    return await notFound(event, 'TRANSFER_PAYMENT_PROFILE_NOT_FOUND', 'apiErrors.transfer_payment.profile_not_found')
  }

  const query = await getValidatedQueryI18n(event, TransferPaymentListQuerySchema)
  return await listTransferPaymentStreams(db, profileId, query)
})
