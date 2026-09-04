import { sql } from 'kysely'
import { authorize } from '~~/server/utils/authorize'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { throwIfTransferPaymentUniqueConstraintError } from '~~/server/utils/transfer-payment-unique-constraint-errors'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'
import { TransferPaymentStreamChartOfAccountSchema } from '~~/shared/types/schemas/transfer-payment'

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
        const streamBudget = await trx.selectFrom('Transfer_Payment_Stream_Budget').select('id')
          .where('id', '=', String(body.egcs_tp_streambudget))
          .where('egcs_tp_transferpaymentstream', '=', streamId)
          .where('_deleted', '=', false)
          .forUpdate()
          .executeTakeFirst()
        if (!streamBudget) {
          return await notFound(event, 'TRANSFER_PAYMENT_STREAM_BUDGET_NOT_FOUND', 'apiErrors.transfer_payment.stream_budget_not_found')
        }

        return await trx.insertInto('Transfer_Payment_Stream_Chart_of_Account')
          .values({
            ...body,
            egcs_tp_accountingdimensions: sql`${JSON.stringify(body.egcs_tp_accountingdimensions)}::jsonb`,
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
