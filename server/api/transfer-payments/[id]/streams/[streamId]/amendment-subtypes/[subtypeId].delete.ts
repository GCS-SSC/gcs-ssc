import { authorize } from '~~/server/utils/authorize'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'
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
  const subtypeId = getRouterParam(event, 'subtypeId')

  if (!profileId || !streamId || !subtypeId) {
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  }
  if (!isPositivePostgresBigintText(subtypeId)) {
    return await notFound(event, 'AMENDMENT_SUBTYPE_NOT_FOUND', 'apiErrors.transfer_payment.amendment_subtype_not_found')
  }

  const streamContext = await authorizeTransferPaymentStreamResource(event, 'delete', profileId, streamId)
  if (!streamContext) {
    return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }

  await authorize(event, 'transfer_payment', 'delete', createTransferPaymentScopedAuthorizeHandler('delete', streamContext.scope, db))

  return await executeFreshAuthorizedTransferPaymentStreamWrite(
    event, db, profileId, streamContext.agencyId, streamId, 'delete', async trx => {
      const existing = await trx
        .selectFrom('Transfer_Payment_Amendment_Subtype')
        .where('id', '=', subtypeId)
        .where('egcs_tp_transferpaymentstream', '=', streamId)
        .where('_deleted', '=', false)
        .select('id')
        .forUpdate()
        .executeTakeFirst()

      if (!existing) {
        return await notFound(event, 'AMENDMENT_SUBTYPE_NOT_FOUND', 'apiErrors.transfer_payment.amendment_subtype_not_found')
      }

      const amendmentInProgress = await trx
        .selectFrom('Funding_Case_Agreement_Amendment_Subtype')
        .innerJoin(
          'Funding_Case_Agreement_Amendment',
          'Funding_Case_Agreement_Amendment.id',
          'Funding_Case_Agreement_Amendment_Subtype.egcs_fc_amendment'
        )
        .innerJoin('Common_Status', 'Common_Status.id', 'Funding_Case_Agreement_Amendment.egcs_fc_status')
        .select('Funding_Case_Agreement_Amendment.id')
        .where('Funding_Case_Agreement_Amendment_Subtype.egcs_fc_amendmentsubtype', '=', subtypeId)
        .where('Funding_Case_Agreement_Amendment_Subtype._deleted', '=', false)
        .where('Funding_Case_Agreement_Amendment._deleted', '=', false)
        .where('Funding_Case_Agreement_Amendment.egcs_fc_isopen', '=', true)
        .where('Common_Status.egcs_cn_terminal', '=', false)
        .where('Common_Status._deleted', '=', false)
        .forUpdate('Funding_Case_Agreement_Amendment_Subtype')
        .executeTakeFirst()

      if (amendmentInProgress) {
        return await badRequest(
          event,
          'AMENDMENT_SUBTYPE_IN_USE',
          'apiErrors.transfer_payment.amendment_subtype_in_use'
        )
      }

      await trx.updateTable('Transfer_Payment_Amendment_Subtype_Type').set({ _deleted: true })
        .where('egcs_tp_amendmentsubtype', '=', subtypeId).where('_deleted', '=', false).execute()
      await trx.updateTable('Transfer_Payment_Amendment_Subtype').set({ _deleted: true })
        .where('id', '=', subtypeId).where('egcs_tp_transferpaymentstream', '=', streamId)
        .where('_deleted', '=', false).execute()

      return { success: true }
    }
  )
})
