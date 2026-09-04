import { sql } from 'kysely'
import { authorize } from '~~/server/utils/authorize'
import { notFound } from '~~/server/utils/api-errors'
import {
  assertTransferPaymentStreamSetupExists,
  isTransferPaymentStreamSetupPatchRouteContext,
  prepareTransferPaymentStreamSetupPatchRoute,
  readTransferPaymentStreamSetupPatchBody
} from '~~/server/utils/transfer-payment-stream-setup-routes'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { throwIfTransferPaymentUniqueConstraintError } from '~~/server/utils/transfer-payment-unique-constraint-errors'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'
import { TransferPaymentStreamChartOfAccountPatchSchema } from '~~/shared/types/schemas/transfer-payment'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const preliminaryProfileId = getRouterParam(event, 'id')
  const preliminaryStreamId = getRouterParam(event, 'streamId')
  if (preliminaryProfileId && preliminaryStreamId) {
    const access = await authorizeTransferPaymentStreamResource(event, 'update', preliminaryProfileId, preliminaryStreamId)
    if (!access) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }

  const routeContext = await prepareTransferPaymentStreamSetupPatchRoute(event, db, { childParam: 'chartOfAccountId' })
  if (!isTransferPaymentStreamSetupPatchRouteContext(routeContext)) return routeContext

  await assertTransferPaymentStreamSetupExists(
    event,
    db.selectFrom('Transfer_Payment_Stream_Chart_of_Account')
      .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.id', 'Transfer_Payment_Stream_Chart_of_Account.egcs_tp_transferpaymentstream')
      .innerJoin('Transfer_Payment_Profile', 'Transfer_Payment_Profile.id', 'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile')
      .where('Transfer_Payment_Stream_Chart_of_Account.id', '=', routeContext.childId)
      .where('Transfer_Payment_Stream_Chart_of_Account.egcs_tp_transferpaymentstream', '=', routeContext.streamId)
      .where('Transfer_Payment_Stream.egcs_tp_transferpaymentprofile', '=', routeContext.profileId)
      .where('Transfer_Payment_Stream_Chart_of_Account._deleted', '=', false)
      .where('Transfer_Payment_Stream._deleted', '=', false)
      .where('Transfer_Payment_Profile._deleted', '=', false)
      .select('Transfer_Payment_Stream_Chart_of_Account.id')
      .executeTakeFirst(),
    'CHART_OF_ACCOUNT_NOT_FOUND',
    'apiErrors.transfer_payment.chart_of_account_not_found'
  )

  await authorize(event, 'transfer_payment', 'update', createTransferPaymentScopedAuthorizeHandler('update', routeContext.streamContext.scope, db))
  const payload = await readTransferPaymentStreamSetupPatchBody(event, TransferPaymentStreamChartOfAccountPatchSchema)

  try {
    return await executeFreshAuthorizedTransferPaymentStreamWrite(
      event,
      db,
      routeContext.profileId,
      routeContext.streamContext.agencyId,
      routeContext.streamId,
      'update',
      async trx => {
        await assertTransferPaymentStreamSetupExists(
          event,
          trx.selectFrom('Transfer_Payment_Stream_Chart_of_Account').select('id')
            .where('id', '=', routeContext.childId)
            .where('egcs_tp_transferpaymentstream', '=', routeContext.streamId)
            .where('_deleted', '=', false)
            .forUpdate()
            .executeTakeFirst(),
          'CHART_OF_ACCOUNT_NOT_FOUND',
          'apiErrors.transfer_payment.chart_of_account_not_found'
        )

        if (payload.egcs_tp_streambudget) {
          const streamBudget = await trx.selectFrom('Transfer_Payment_Stream_Budget').select('id')
            .where('id', '=', String(payload.egcs_tp_streambudget))
            .where('egcs_tp_transferpaymentstream', '=', routeContext.streamId)
            .where('_deleted', '=', false)
            .forUpdate()
            .executeTakeFirst()
          if (!streamBudget) {
            return await notFound(event, 'TRANSFER_PAYMENT_STREAM_BUDGET_NOT_FOUND', 'apiErrors.transfer_payment.stream_budget_not_found')
          }
        }

        return await trx.updateTable('Transfer_Payment_Stream_Chart_of_Account')
          .set({
            ...payload,
            ...(payload.egcs_tp_accountingdimensions
              ? { egcs_tp_accountingdimensions: sql`${JSON.stringify(payload.egcs_tp_accountingdimensions)}::jsonb` }
              : {})
          })
          .where('id', '=', routeContext.childId)
          .where('egcs_tp_transferpaymentstream', '=', routeContext.streamId)
          .where('_deleted', '=', false)
          .returningAll()
          .executeTakeFirstOrThrow()
      }
    )
  } catch (error) {
    return await throwIfTransferPaymentUniqueConstraintError(event, error)
  }
})
