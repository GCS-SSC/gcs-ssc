import { PaginationSchema } from '~~/shared/types/schemas'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { authorizeTransferPaymentProfileResource } from '~~/server/utils/transfer-payment-route-authorization'

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

  const access = await authorizeTransferPaymentProfileResource(event, 'read', profileId)
  if (!access) {
    return await notFound(event, 'TRANSFER_PAYMENT_PROFILE_NOT_FOUND', 'apiErrors.transfer_payment.profile_not_found')
  }

  const query = await getValidatedQueryI18n(event, PaginationSchema)
  const { page, limit, search } = query
  const offset = (page - 1) * limit

  let baseQuery = db
    .selectFrom('Transfer_Payment_Outcome_Performance_Indicator')
    .innerJoin(
      'Transfer_Payment_Outcome',
      'Transfer_Payment_Outcome.id',
      'Transfer_Payment_Outcome_Performance_Indicator.egcs_tp_transferpaymentoutcome'
    )
    .innerJoin('Transfer_Payment_Profile', 'Transfer_Payment_Profile.id', 'Transfer_Payment_Outcome.egcs_tp_transferpaymentprofile')
    .innerJoin('Agency_Profile', 'Agency_Profile.id', 'Transfer_Payment_Profile.egcs_tp_agency')
    .where('Transfer_Payment_Outcome.egcs_tp_transferpaymentprofile', '=', profileId)
    .where('Transfer_Payment_Outcome_Performance_Indicator._deleted', '=', false)
    .where('Transfer_Payment_Outcome._deleted', '=', false)
    .where('Transfer_Payment_Profile._deleted', '=', false)
    .where('Agency_Profile._deleted', '=', false)

  if (search) {
    baseQuery = baseQuery.where(eb =>
      eb.or([
        eb('Transfer_Payment_Outcome_Performance_Indicator.egcs_tp_name_en', 'ilike', `%${escapeLikePattern(search)}%`),
        eb('Transfer_Payment_Outcome_Performance_Indicator.egcs_tp_name_fr', 'ilike', `%${escapeLikePattern(search)}%`),
        eb('Transfer_Payment_Outcome_Performance_Indicator.egcs_tp_description_en', 'ilike', `%${escapeLikePattern(search)}%`),
        eb('Transfer_Payment_Outcome_Performance_Indicator.egcs_tp_description_fr', 'ilike', `%${escapeLikePattern(search)}%`),
        eb('Transfer_Payment_Outcome.egcs_tp_name_en', 'ilike', `%${escapeLikePattern(search)}%`),
        eb('Transfer_Payment_Outcome.egcs_tp_name_fr', 'ilike', `%${escapeLikePattern(search)}%`)
      ])
    )
  }

  const [items, countResult] = await Promise.all([
    baseQuery
      .select([
        'Transfer_Payment_Outcome_Performance_Indicator.id as id',
        'Transfer_Payment_Outcome_Performance_Indicator.egcs_tp_transferpaymentoutcome as egcs_tp_transferpaymentoutcome',
        'Transfer_Payment_Outcome_Performance_Indicator.egcs_tp_name_en as egcs_tp_name_en',
        'Transfer_Payment_Outcome_Performance_Indicator.egcs_tp_name_fr as egcs_tp_name_fr',
        'Transfer_Payment_Outcome_Performance_Indicator.egcs_tp_description_en as egcs_tp_description_en',
        'Transfer_Payment_Outcome_Performance_Indicator.egcs_tp_description_fr as egcs_tp_description_fr',
        'Transfer_Payment_Outcome.egcs_tp_name_en as outcome_name_en',
        'Transfer_Payment_Outcome.egcs_tp_name_fr as outcome_name_fr'
      ])
      .orderBy('Transfer_Payment_Outcome_Performance_Indicator.id', 'asc')
      .limit(limit)
      .offset(offset)
      .execute(),
    baseQuery
      .select(eb => eb.fn.count('Transfer_Payment_Outcome_Performance_Indicator.id').as('total'))
      .executeTakeFirst()
  ])

  const total = Number(countResult?.total || 0)

  return {
    items,
    total,
    stats: {
      total,
      active: total
    },
    page,
    limit
  }
})
