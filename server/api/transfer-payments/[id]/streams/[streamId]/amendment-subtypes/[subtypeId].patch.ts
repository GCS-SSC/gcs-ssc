import { isAmendmentSubtypeInUse } from '~~/server/utils/amendment-catalog-integrity'
import { defineEventHandler, getRouterParam } from 'h3'
import { TransferPaymentAmendmentSubtypesSchema } from '~~/shared/types/schemas/transfer-payment'
import { authorize } from '~~/server/utils/authorize'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import {
  assertTransferPaymentStreamSetupExists,
  executeTransferPaymentStreamSetupUpdate,
  isTransferPaymentStreamSetupPatchRouteContext,
  prepareTransferPaymentStreamSetupPatchRoute,
  readTransferPaymentStreamSetupPatchBody
} from '~~/server/utils/transfer-payment-stream-setup-routes'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'

/**
 *  * Event handler for this server API route. Handles the incoming request payload, performs necessary business logic and authorization operations, and returns the expected endpoint response array or object.
 *  *
 *  * @param event - The active H3 event context encapsulating the request and response objects.
 *
 */
export default defineEventHandler(async event => {
  const db = event.context.$db
  const preliminaryProfileId = getRouterParam(event, 'id')
  const preliminaryStreamId = getRouterParam(event, 'streamId')
  if (preliminaryProfileId && preliminaryStreamId) {
    const access = await authorizeTransferPaymentStreamResource(event, 'update', preliminaryProfileId, preliminaryStreamId)
    if (!access) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }
  const routeContext = await prepareTransferPaymentStreamSetupPatchRoute(event, db, {
    childParam: 'subtypeId'
  })
  if (!isTransferPaymentStreamSetupPatchRouteContext(routeContext)) {
    return routeContext
  }

  const { profileId, streamId, childId: subtypeId, streamContext } = routeContext
  await authorize(event, 'transfer_payment', 'update', createTransferPaymentScopedAuthorizeHandler('update', streamContext.scope, db))

  const patchSchema = TransferPaymentAmendmentSubtypesSchema.omit({
    egcs_tp_transferpaymentstream: true
  }).partial()
  const payload = await readTransferPaymentStreamSetupPatchBody(event, patchSchema)

  return await executeFreshAuthorizedTransferPaymentStreamWrite(
    event, db, profileId, streamContext.agencyId, streamId, 'update', async trx => {
      const current = await assertTransferPaymentStreamSetupExists(event, trx
        .selectFrom('Transfer_Payment_Amendment_Subtype')
        .where('id', '=', subtypeId)
        .where('egcs_tp_transferpaymentstream', '=', streamId)
        .where('_deleted', '=', false)
        .selectAll()
        .forUpdate()
        .executeTakeFirst(), 'AMENDMENT_SUBTYPE_NOT_FOUND', 'apiErrors.transfer_payment.amendment_subtype_not_found')

      const { amendment_type_ids: amendmentTypeIds, ...subtypeValues } = payload
      const currentTypeIds = await trx.selectFrom('Transfer_Payment_Amendment_Subtype_Type')
        .select('egcs_tp_amendmenttype').where('egcs_tp_amendmentsubtype', '=', subtypeId)
        .where('_deleted', '=', false).execute().then(rows => rows.map(row => String(row.egcs_tp_amendmenttype)))
      const mappingChanged = amendmentTypeIds !== undefined && (amendmentTypeIds.length !== currentTypeIds.length
        || amendmentTypeIds.some(id => !currentTypeIds.includes(id)))
      const definitionChanged = (subtypeValues.egcs_tp_name_en !== undefined && subtypeValues.egcs_tp_name_en !== current.egcs_tp_name_en)
        || (subtypeValues.egcs_tp_name_fr !== undefined && subtypeValues.egcs_tp_name_fr !== current.egcs_tp_name_fr)
        || (subtypeValues.egcs_tp_description_en !== undefined && subtypeValues.egcs_tp_description_en !== current.egcs_tp_description_en)
        || (subtypeValues.egcs_tp_description_fr !== undefined && subtypeValues.egcs_tp_description_fr !== current.egcs_tp_description_fr)
      if ((definitionChanged || mappingChanged) && await isAmendmentSubtypeInUse(trx, subtypeId)) {
        return await badRequest(event, 'AMENDMENT_SUBTYPE_IN_USE', 'apiErrors.transfer_payment.amendment_subtype_in_use')
      }
      if (mappingChanged && amendmentTypeIds) {
        const amendmentTypes = await trx.selectFrom('Transfer_Payment_Amendment_Type')
          .where('id', 'in', amendmentTypeIds).where('egcs_tp_transferpaymentstream', '=', streamId)
          .where('_deleted', '=', false).where('egcs_tp_active', '=', true).select('id').execute()
        if (amendmentTypes.length !== amendmentTypeIds.length) {
          return await badRequest(event, 'INVALID_AMENDMENT_TYPE', 'apiErrors.transfer_payment.invalid_amendment_type')
        }
      }
      const updated = Object.keys(subtypeValues).length > 0
        ? await executeTransferPaymentStreamSetupUpdate(event, trx
            .updateTable('Transfer_Payment_Amendment_Subtype')
            .set(subtypeValues)
            .where('id', '=', subtypeId)
            .where('egcs_tp_transferpaymentstream', '=', streamId)
            .where('_deleted', '=', false)
            .returningAll()
            .executeTakeFirstOrThrow()
          )
        : await trx.selectFrom('Transfer_Payment_Amendment_Subtype').selectAll()
            .where('id', '=', subtypeId).where('egcs_tp_transferpaymentstream', '=', streamId)
            .where('_deleted', '=', false).executeTakeFirstOrThrow()
      if (mappingChanged && amendmentTypeIds) {
        await trx.updateTable('Transfer_Payment_Amendment_Subtype_Type').set({ _deleted: true })
          .where('egcs_tp_amendmentsubtype', '=', subtypeId).where('_deleted', '=', false).execute()
        await trx.insertInto('Transfer_Payment_Amendment_Subtype_Type').values(amendmentTypeIds.map(typeId => ({
          egcs_tp_amendmentsubtype: subtypeId,
          egcs_tp_amendmenttype: typeId,
          _deleted: false
        }))).execute()
      }
      return { ...updated, amendment_type_ids: amendmentTypeIds ?? currentTypeIds }
    }
  )
})
