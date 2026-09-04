import { authorize } from '~~/server/utils/authorize'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { resolveTransferPaymentAmendmentTypeScopeContext } from '~~/server/utils/transfer-payment-amendment-types'
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
  const amendmentTypeId = getRouterParam(event, 'amendmentTypeId')

  if (!profileId || !streamId || !amendmentTypeId) {
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  }
  if (!isPositivePostgresBigintText(amendmentTypeId)) {
    return await notFound(event, 'AMENDMENT_TYPE_NOT_FOUND', 'apiErrors.transfer_payment.amendment_type_not_found')
  }

  const streamAccess = await authorizeTransferPaymentStreamResource(event, 'delete', profileId, streamId)
  if (!streamAccess) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')

  const amendmentTypeContext = await resolveTransferPaymentAmendmentTypeScopeContext(profileId, streamId, amendmentTypeId, db)
  if (!amendmentTypeContext) {
    return await notFound(event, 'AMENDMENT_TYPE_NOT_FOUND', 'apiErrors.transfer_payment.amendment_type_not_found')
  }

  await authorize(event, 'transfer_payment', 'delete', createTransferPaymentScopedAuthorizeHandler('delete', amendmentTypeContext.scope, db))

  return await executeFreshAuthorizedTransferPaymentStreamWrite(
    event, db, profileId, amendmentTypeContext.agencyId, streamId, 'delete', async trx => {
      const amendmentType = await trx.selectFrom('Transfer_Payment_Amendment_Type').select('id')
        .where('id', '=', amendmentTypeId).where('egcs_tp_transferpaymentstream', '=', streamId)
        .where('_deleted', '=', false).forUpdate().executeTakeFirst()
      if (!amendmentType) {
        return await notFound(event, 'AMENDMENT_TYPE_NOT_FOUND', 'apiErrors.transfer_payment.amendment_type_not_found')
      }
      const activeAmendmentReference = await trx.selectFrom('Funding_Case_Agreement_Amendment_Type')
        .innerJoin('Funding_Case_Agreement_Amendment', 'Funding_Case_Agreement_Amendment.id', 'Funding_Case_Agreement_Amendment_Type.egcs_fc_amendment')
        .select('Funding_Case_Agreement_Amendment_Type.id')
        .where('Funding_Case_Agreement_Amendment_Type.egcs_fc_amendmenttype', '=', amendmentTypeId)
        .where('Funding_Case_Agreement_Amendment_Type._deleted', '=', false)
        .where('Funding_Case_Agreement_Amendment._deleted', '=', false)
        .orderBy('Funding_Case_Agreement_Amendment_Type.id', 'asc')
        .forUpdate('Funding_Case_Agreement_Amendment_Type')
        .executeTakeFirst()
      const activeSubtypeReference = await trx.selectFrom('Transfer_Payment_Amendment_Subtype_Type')
        .innerJoin('Transfer_Payment_Amendment_Subtype', 'Transfer_Payment_Amendment_Subtype.id', 'Transfer_Payment_Amendment_Subtype_Type.egcs_tp_amendmentsubtype')
        .select('Transfer_Payment_Amendment_Subtype_Type.id')
        .where('Transfer_Payment_Amendment_Subtype_Type.egcs_tp_amendmenttype', '=', amendmentTypeId)
        .where('Transfer_Payment_Amendment_Subtype.egcs_tp_transferpaymentstream', '=', streamId)
        .where('Transfer_Payment_Amendment_Subtype._deleted', '=', false)
        .orderBy('Transfer_Payment_Amendment_Subtype_Type.id', 'asc')
        .forUpdate('Transfer_Payment_Amendment_Subtype_Type')
        .executeTakeFirst()
      if (activeAmendmentReference || activeSubtypeReference) {
        return await throwApiError(event, {
          statusCode: 409,
          code: 'AMENDMENT_TYPE_IN_USE',
          key: 'apiErrors.request.resource_in_use'
        })
      }
      await trx.updateTable('Transfer_Payment_Amendment_Type').set({ _deleted: true })
        .where('id', '=', amendmentTypeId).where('egcs_tp_transferpaymentstream', '=', streamId)
        .where('_deleted', '=', false).execute()
      return { success: true }
    }
  )
})
