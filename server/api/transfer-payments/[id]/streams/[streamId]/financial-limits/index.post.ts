import { authorize } from '~~/server/utils/authorize'
import { createTransferPaymentScopedAuthorizeHandler, authorizeTransferPaymentStreamResource } from '~~/server/utils/transfer-payment-route-authorization'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { notFound, badRequest } from '~~/server/utils/api-errors'
import { TransferPaymentFinancialLimitsSchema } from '~~/shared/types/schemas/transfer-payment'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'
import { sql } from 'kysely'
import { databaseMoneyText, databaseMoneyValue, parseDatabaseMoney } from '~~/server/utils/database-money'

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

  const streamContext = await authorizeTransferPaymentStreamResource(event, 'create', profileId, streamId)
  if (!streamContext)
    return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')

  await authorize(event, 'transfer_payment', 'create', createTransferPaymentScopedAuthorizeHandler('create', streamContext.scope, db))

  const validated = await readValidatedBodyI18n(event, TransferPaymentFinancialLimitsSchema)

  // Enforce stream ID from URL for ownership consistency
  if (String(validated.egcs_tp_transferpaymentstream) !== streamId) {
    return await badRequest(event, 'STREAM_ID_MISMATCH', 'apiErrors.request.stream_id_mismatch')
  }

  // Check if an active record already exists for this stream
  return await executeFreshAuthorizedTransferPaymentStreamWrite(
    event, db, profileId, streamContext.agencyId, streamId, 'create', async trx => {
      const existing = await trx.selectFrom('Transfer_Payment_Financial_Limits').select('id')
        .where('egcs_tp_transferpaymentstream', '=', streamId).where('_deleted', '=', false)
        .forUpdate().executeTakeFirst()
      if (existing) return await badRequest(event, 'DUPLICATE_ACTIVE_RECORD', 'apiErrors.transfer_payment.financial_limit_exists')
      return await trx.insertInto('Transfer_Payment_Financial_Limits')
        .values({
          ...validated,
          egcs_tp_maxallowableperrecipient: databaseMoneyValue(validated.egcs_tp_maxallowableperrecipient),
          _deleted: false
        }).returning([
          'id', 'egcs_tp_transferpaymentstream',
          databaseMoneyText(sql.ref('egcs_tp_maxallowableperrecipient')).as('egcs_tp_maxallowableperrecipient'),
          'egcs_tp_maxpercentofsupportavailableperrecipient',
          'egcs_tp_maxpercentofretroactivecostsallowable', 'egcs_tp_stackinglimit', 'egcs_tp_active', '_deleted'
        ]).executeTakeFirst()
        .then(row => row && ({ ...row, egcs_tp_maxallowableperrecipient: parseDatabaseMoney(row.egcs_tp_maxallowableperrecipient) }))
    }
  )
})
