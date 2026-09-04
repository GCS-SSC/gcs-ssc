import { TransferPaymentAgreementSubtypeSchema } from '~~/shared/types/schemas'
import { authorize } from '~~/server/utils/authorize'
import { resolveTransferPaymentAgreementSubtypeStreamScopeContext } from '~~/server/utils/transfer-payment-agreement-subtypes'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import {
  assertTransferPaymentStreamSetupExists,
  executeTransferPaymentStreamSetupUpdate,
  isTransferPaymentStreamSetupPatchRouteContext,
  prepareTransferPaymentStreamSetupPatchRoute,
  readTransferPaymentStreamSetupPatchBody
} from '~~/server/utils/transfer-payment-stream-setup-routes'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const preliminaryProfileId = getRouterParam(event, 'id')
  const preliminaryStreamId = getRouterParam(event, 'streamId')
  if (preliminaryProfileId && preliminaryStreamId) {
    const access = await authorizeTransferPaymentStreamResource(event, 'update', preliminaryProfileId, preliminaryStreamId)
    if (!access) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }
  const routeContext = await prepareTransferPaymentStreamSetupPatchRoute(event, db, {
    childParam: 'agreementSubtypeId',
    resolveStreamContext: resolveTransferPaymentAgreementSubtypeStreamScopeContext
  })
  if (!isTransferPaymentStreamSetupPatchRouteContext(routeContext)) {
    return routeContext
  }

  const { profileId, streamId, childId: agreementSubtypeId, streamContext } = routeContext
  await authorize(event, 'transfer_payment', 'update', createTransferPaymentScopedAuthorizeHandler('update', streamContext.scope, db))

  const patchSchema = TransferPaymentAgreementSubtypeSchema.omit({
    egcs_tp_transferpaymentstream: true
  }).partial()
  const payload = await readTransferPaymentStreamSetupPatchBody(event, patchSchema)

  return await executeFreshAuthorizedTransferPaymentStreamWrite(
    event, db, profileId, streamContext.agencyId, streamId, 'update', async (trx, freshContext) => {
      await assertTransferPaymentStreamSetupExists(
        event,
        trx.selectFrom('Transfer_Payment_Agreement_Subtype')
          .where('id', '=', agreementSubtypeId)
          .where('egcs_tp_transferpaymentstream', '=', streamId)
          .where('_deleted', '=', false)
          .select('id')
          .forUpdate()
          .executeTakeFirst(),
        'AGREEMENT_SUBTYPE_NOT_FOUND',
        'apiErrors.transfer_payment.agreement_subtype_not_found'
      )

      if (payload.egcs_tp_agreementtype) {
        const agreementType = await trx.selectFrom('Agency_Agreement_Type')
          .where('id', '=', payload.egcs_tp_agreementtype)
          .where('egcs_ay_organizationagency', '=', freshContext.agencyId)
          .where('_deleted', '=', false).select('id').executeTakeFirst()
        if (!agreementType) {
          return await badRequest(event, 'INVALID_AGREEMENT_TYPE', 'apiErrors.transfer_payment.invalid_agreement_type')
        }
      }

      return await executeTransferPaymentStreamSetupUpdate(event, trx
        .updateTable('Transfer_Payment_Agreement_Subtype')
        .set(payload)
        .where('id', '=', agreementSubtypeId)
        .where('egcs_tp_transferpaymentstream', '=', streamId)
        .where('_deleted', '=', false)
        .returningAll()
        .executeTakeFirstOrThrow())
    }
  )
})
