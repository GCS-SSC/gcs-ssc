import { TransferPaymentAmendmentTypeSchema } from '~~/shared/types/schemas/transfer-payment'
import { authorize } from '~~/server/utils/authorize'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { resolveTransferPaymentAmendmentTypeScopeContext } from '~~/server/utils/transfer-payment-amendment-types'
import { throwIfTransferPaymentUniqueConstraintError } from '~~/server/utils/transfer-payment-unique-constraint-errors'
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

  const streamAccess = await authorizeTransferPaymentStreamResource(event, 'update', profileId, streamId)
  if (!streamAccess) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')

  const patchSchema = TransferPaymentAmendmentTypeSchema.omit({
    egcs_tp_transferpaymentstream: true
  }).partial()
  const payload = await readValidatedBodyI18n(event, patchSchema)
  if (Object.keys(payload).length === 0) {
    return await badRequest(event, 'NO_UPDATABLE_FIELDS', 'apiErrors.request.no_updatable_fields')
  }

  const amendmentTypeContext = await resolveTransferPaymentAmendmentTypeScopeContext(profileId, streamId, amendmentTypeId, db)
  if (!amendmentTypeContext) {
    return await notFound(event, 'AMENDMENT_TYPE_NOT_FOUND', 'apiErrors.transfer_payment.amendment_type_not_found')
  }

  await authorize(event, 'transfer_payment', 'update', createTransferPaymentScopedAuthorizeHandler('update', amendmentTypeContext.scope, db))

  try {
    return await executeFreshAuthorizedTransferPaymentStreamWrite(
      event, db, profileId, amendmentTypeContext.agencyId, streamId, 'update', async trx => {
        const amendmentType = await trx.selectFrom('Transfer_Payment_Amendment_Type').select(['id', 'egcs_tp_amended'])
          .where('id', '=', amendmentTypeId).where('egcs_tp_transferpaymentstream', '=', streamId)
          .where('_deleted', '=', false).forUpdate().executeTakeFirst()
        if (!amendmentType) {
          return await notFound(event, 'AMENDMENT_TYPE_NOT_FOUND', 'apiErrors.transfer_payment.amendment_type_not_found')
        }
        if (payload.egcs_tp_amended !== undefined && payload.egcs_tp_amended !== amendmentType.egcs_tp_amended) {
          const reference = await trx.selectFrom('Funding_Case_Agreement_Amendment_Type')
            .innerJoin('Funding_Case_Agreement_Amendment', 'Funding_Case_Agreement_Amendment.id', 'Funding_Case_Agreement_Amendment_Type.egcs_fc_amendment')
            .select('Funding_Case_Agreement_Amendment_Type.id')
            .where('Funding_Case_Agreement_Amendment_Type.egcs_fc_amendmenttype', '=', amendmentTypeId)
            .where('Funding_Case_Agreement_Amendment_Type._deleted', '=', false)
            .where('Funding_Case_Agreement_Amendment._deleted', '=', false)
            .where('Funding_Case_Agreement_Amendment.egcs_fc_isopen', '=', true)
            .forUpdate('Funding_Case_Agreement_Amendment_Type').executeTakeFirst()
          if (reference) {
            return await badRequest(event, 'AMENDMENT_TYPE_IN_USE', 'apiErrors.transfer_payment.amendment_type_in_use')
          }
        }
        return await trx.updateTable('Transfer_Payment_Amendment_Type').set(payload)
          .where('id', '=', amendmentTypeId).where('egcs_tp_transferpaymentstream', '=', streamId)
          .where('_deleted', '=', false).returningAll().executeTakeFirstOrThrow()
      }
    )
  } catch (error) {
    return await throwIfTransferPaymentUniqueConstraintError(event, error)
  }
})
