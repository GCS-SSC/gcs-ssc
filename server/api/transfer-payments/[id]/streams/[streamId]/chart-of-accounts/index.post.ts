import { authorize } from '~~/server/utils/authorize'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { throwIfTransferPaymentUniqueConstraintError } from '~~/server/utils/transfer-payment-unique-constraint-errors'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'
import { TransferPaymentStreamChartOfAccountSchema } from '~~/shared/types/schemas/transfer-payment'
import { findEligibleAgencyChart } from '~~/server/utils/agency-finance-catalog'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  if (!profileId || !streamId) {
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  }

  const streamContext = await authorizeTransferPaymentStreamResource(event, 'create', profileId, streamId)
  if (!streamContext) {
    return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }
  await authorize(event, 'transfer_payment', 'create', createTransferPaymentScopedAuthorizeHandler('create', streamContext.scope, db))

  const body = await readValidatedBodyI18n(event, TransferPaymentStreamChartOfAccountSchema)
  try {
    return await executeFreshAuthorizedTransferPaymentStreamWrite(
      event,
      db,
      profileId,
      streamContext.agencyId,
      streamId,
      'create',
      async trx => {
        const chart = await findEligibleAgencyChart(trx, String(body.egcs_tp_agencychartofaccount), streamContext.agencyId, streamId)
        if (!chart) {
          return await notFound(event, 'CHART_OF_ACCOUNT_NOT_FOUND', 'apiErrors.transfer_payment.chart_of_account_not_found')
        }

        return await trx.insertInto('Transfer_Payment_Stream_Chart_of_Account')
          .values({
            ...body,
            egcs_tp_transferpaymentstream: streamId,
            _deleted: false
          })
          .returningAll()
          .executeTakeFirstOrThrow()
      }
    )
  } catch (error) {
    return await throwIfTransferPaymentUniqueConstraintError(event, error)
  }
})
