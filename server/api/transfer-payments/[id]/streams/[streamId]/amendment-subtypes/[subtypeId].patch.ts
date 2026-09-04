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
      await assertTransferPaymentStreamSetupExists(event, trx
        .selectFrom('Transfer_Payment_Amendment_Subtype')
        .where('id', '=', subtypeId)
        .where('egcs_tp_transferpaymentstream', '=', streamId)
        .where('_deleted', '=', false)
        .select(['id', 'egcs_tp_name_en', 'egcs_tp_name_fr'])
        .forUpdate()
        .executeTakeFirst(), 'AMENDMENT_SUBTYPE_NOT_FOUND', 'apiErrors.transfer_payment.amendment_subtype_not_found')

      const { amendment_type_ids: amendmentTypeIds, ...subtypeValues } = payload
      if (amendmentTypeIds) {
        const amendmentTypes = await trx.selectFrom('Transfer_Payment_Amendment_Type')
          .where('id', 'in', amendmentTypeIds).where('egcs_tp_transferpaymentstream', '=', streamId)
          .where('_deleted', '=', false).select('id').execute()
        if (amendmentTypes.length !== amendmentTypeIds.length) {
          return await badRequest(event, 'INVALID_AMENDMENT_TYPE', 'apiErrors.transfer_payment.invalid_amendment_type')
        }
        const amendmentScopeRows = await trx
          .selectFrom('Funding_Case_Agreement_Amendment_Subtype')
          .innerJoin(
            'Funding_Case_Agreement_Amendment',
            'Funding_Case_Agreement_Amendment.id',
            'Funding_Case_Agreement_Amendment_Subtype.egcs_fc_amendment'
          )
          .innerJoin(
            'Funding_Case_Agreement_Amendment_Type',
            'Funding_Case_Agreement_Amendment_Type.egcs_fc_amendment',
            'Funding_Case_Agreement_Amendment.id'
          )
          .innerJoin('Common_Status', 'Common_Status.id', 'Funding_Case_Agreement_Amendment.egcs_fc_status')
          .select([
            'Funding_Case_Agreement_Amendment.id as amendment_id',
            'Funding_Case_Agreement_Amendment_Type.egcs_fc_amendmenttype as amendment_type_id'
          ])
          .where('Funding_Case_Agreement_Amendment_Subtype.egcs_fc_amendmentsubtype', '=', subtypeId)
          .where('Funding_Case_Agreement_Amendment_Subtype._deleted', '=', false)
          .where('Funding_Case_Agreement_Amendment_Type._deleted', '=', false)
          .where('Funding_Case_Agreement_Amendment._deleted', '=', false)
          .where('Funding_Case_Agreement_Amendment.egcs_fc_isopen', '=', true)
          .where('Common_Status.egcs_cn_terminal', '=', false)
          .where('Common_Status._deleted', '=', false)
          .forUpdate('Funding_Case_Agreement_Amendment_Subtype')
          .execute()
        const retainedTypeIds = new Set(amendmentTypeIds)
        const compatibleAmendments = new Set(
          amendmentScopeRows
            .filter(row => retainedTypeIds.has(String(row.amendment_type_id)))
            .map(row => String(row.amendment_id))
        )
        const invalidatesAmendment = amendmentScopeRows.some(
          row => !compatibleAmendments.has(String(row.amendment_id))
        )

        if (invalidatesAmendment) {
          return await badRequest(
            event,
            'AMENDMENT_SUBTYPE_MAPPING_IN_USE',
            'apiErrors.transfer_payment.amendment_subtype_mapping_in_use'
          )
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
      if (amendmentTypeIds) {
        await trx.updateTable('Transfer_Payment_Amendment_Subtype_Type').set({ _deleted: true })
          .where('egcs_tp_amendmentsubtype', '=', subtypeId).where('_deleted', '=', false).execute()
        await trx.insertInto('Transfer_Payment_Amendment_Subtype_Type').values(amendmentTypeIds.map(typeId => ({
          egcs_tp_amendmentsubtype: subtypeId,
          egcs_tp_amendmenttype: typeId,
          _deleted: false
        }))).execute()
      }
      return { ...updated, amendment_type_ids: amendmentTypeIds }
    }
  )
})
