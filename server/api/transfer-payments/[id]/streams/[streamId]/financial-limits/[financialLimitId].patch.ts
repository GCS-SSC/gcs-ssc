import { authorize } from '~~/server/utils/authorize'
import { createTransferPaymentScopedAuthorizeHandler, authorizeTransferPaymentStreamResource } from '~~/server/utils/transfer-payment-route-authorization'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { notFound, badRequest } from '~~/server/utils/api-errors'
import { TransferPaymentFinancialLimitsSchema } from '~~/shared/types/schemas/transfer-payment'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'
import { sql } from 'kysely'
import { databaseMoneyText, databaseMoneyValue, parseDatabaseMoney } from '~~/server/utils/database-money'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

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
  const financialLimitId = getRouterParam(event, 'financialLimitId')

  if (!profileId || !streamId || !financialLimitId)
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  if (!isPositivePostgresBigintText(financialLimitId))
    return await notFound(event, 'FINANCIAL_LIMIT_NOT_FOUND', 'apiErrors.transfer_payment.financial_limit_not_found')

  const streamContext = await authorizeTransferPaymentStreamResource(event, 'update', profileId, streamId)
  if (!streamContext)
    return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')

  await authorize(event, 'transfer_payment', 'update', createTransferPaymentScopedAuthorizeHandler('update', streamContext.scope, db))

  const patchSchema = TransferPaymentFinancialLimitsSchema.partial().omit({ egcs_tp_transferpaymentstream: true })
  const validated = await readValidatedBodyI18n(event, patchSchema)
  if (Object.keys(validated).length === 0)
    return await badRequest(event, 'NO_UPDATABLE_FIELDS', 'apiErrors.request.no_updatable_fields')

  return await executeFreshAuthorizedTransferPaymentStreamWrite(
    event, db, profileId, streamContext.agencyId, streamId, 'update', async trx => {
      const { egcs_tp_maxallowableperrecipient, ...nonMoneyValues } = validated
      const result = await trx.updateTable('Transfer_Payment_Financial_Limits').set({
        ...nonMoneyValues,
        ...(egcs_tp_maxallowableperrecipient === undefined
          ? {}
          : { egcs_tp_maxallowableperrecipient: databaseMoneyValue(egcs_tp_maxallowableperrecipient) })
      })
        .where('id', '=', financialLimitId).where('egcs_tp_transferpaymentstream', '=', streamId)
        .where('_deleted', '=', false).returning([
          'id', 'egcs_tp_transferpaymentstream',
          databaseMoneyText(sql.ref('egcs_tp_maxallowableperrecipient')).as('egcs_tp_maxallowableperrecipient'),
          'egcs_tp_maxpercentofsupportavailableperrecipient',
          'egcs_tp_maxpercentofretroactivecostsallowable', 'egcs_tp_stackinglimit', 'egcs_tp_active', '_deleted'
        ]).executeTakeFirst()
      if (!result) return await notFound(event, 'FINANCIAL_LIMIT_NOT_FOUND', 'apiErrors.transfer_payment.financial_limit_not_found')
      return { ...result, egcs_tp_maxallowableperrecipient: parseDatabaseMoney(result.egcs_tp_maxallowableperrecipient) }
    }
  )
})
