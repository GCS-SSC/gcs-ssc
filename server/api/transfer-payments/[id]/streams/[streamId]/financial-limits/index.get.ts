import { authorize } from '~~/server/utils/authorize'
import { createTransferPaymentScopedAuthorizeHandler, authorizeTransferPaymentStreamResource } from '~~/server/utils/transfer-payment-route-authorization'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { notFound, badRequest } from '~~/server/utils/api-errors'
import { PaginationSchema } from '~~/shared/types/schemas/common'
import { sql } from 'kysely'
import { databaseMoneyText, parseDatabaseMoney } from '~~/server/utils/database-money'

/**
 *  * Event handler for this server API route. Handles the incoming request payload, performs necessary business logic and authorization operations, and returns the expected endpoint response array or object.
 *  *
 *  * @param event - The active H3 event context encapsulating the request and response objects.
 *
 */
export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  if (!profileId || !streamId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')

  const streamContext = await authorizeTransferPaymentStreamResource(event, 'read', profileId, streamId)
  if (!streamContext)
    return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')

  await authorize(event, 'transfer_payment', 'read', createTransferPaymentScopedAuthorizeHandler('read', streamContext.scope, db))

  const query = await getValidatedQueryI18n(event, PaginationSchema)
  const { page, limit } = query
  const offset = (page - 1) * limit

  const baseQuery = db
    .selectFrom('Transfer_Payment_Financial_Limits')
    .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.id', 'Transfer_Payment_Financial_Limits.egcs_tp_transferpaymentstream')
    .innerJoin('Transfer_Payment_Profile', 'Transfer_Payment_Profile.id', 'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile')
    .innerJoin('Agency_Profile', 'Agency_Profile.id', 'Transfer_Payment_Profile.egcs_tp_agency')
    .where('Transfer_Payment_Financial_Limits.egcs_tp_transferpaymentstream', '=', streamId)
    .where('Transfer_Payment_Stream.egcs_tp_transferpaymentprofile', '=', profileId)
    .where('Transfer_Payment_Financial_Limits._deleted', '=', false)
    .where('Transfer_Payment_Stream._deleted', '=', false)
    .where('Transfer_Payment_Profile._deleted', '=', false)
    .where('Agency_Profile._deleted', '=', false)

  const [items, statsResult] = await Promise.all([
    baseQuery.select([
      'Transfer_Payment_Financial_Limits.id', 'Transfer_Payment_Financial_Limits.egcs_tp_transferpaymentstream',
      databaseMoneyText(sql.ref('Transfer_Payment_Financial_Limits.egcs_tp_maxallowableperrecipient')).as('egcs_tp_maxallowableperrecipient'),
      'Transfer_Payment_Financial_Limits.egcs_tp_maxpercentofsupportavailableperrecipient',
      'Transfer_Payment_Financial_Limits.egcs_tp_maxpercentofretroactivecostsallowable',
      'Transfer_Payment_Financial_Limits.egcs_tp_stackinglimit',
      'Transfer_Payment_Financial_Limits.egcs_tp_active',
      'Transfer_Payment_Financial_Limits._deleted'
    ]).orderBy('Transfer_Payment_Financial_Limits.id', 'asc').limit(limit).offset(offset).execute(),
    baseQuery
      .select(eb => [
        eb.fn.count('Transfer_Payment_Financial_Limits.id').as('total'),
        eb.fn.count('Transfer_Payment_Financial_Limits.id')
          .filterWhere('Transfer_Payment_Financial_Limits.egcs_tp_active', '=', true).as('active')
      ])
      .executeTakeFirst()
  ])

  const total = Number(statsResult?.active ?? 0)

  return {
    items: items.map(item => ({
      ...item,
      egcs_tp_maxallowableperrecipient: parseDatabaseMoney(item.egcs_tp_maxallowableperrecipient)
    })),
    total,
    stats: {
      total: Number(statsResult?.total ?? 0),
      active: Number(statsResult?.active ?? 0)
    },
    page,
    limit
  }
})
