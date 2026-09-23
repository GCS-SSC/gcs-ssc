import { authorize } from '~~/server/utils/authorize'
import { createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { TransferPaymentStreamDocumentTemplateLinkSchema } from '~~/shared/types/schemas'
import { resolveTransferPaymentAgreementSubtypeStreamScopeContext } from '~~/server/utils/transfer-payment-agreement-subtypes'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'
import { throwIfTransferPaymentUniqueConstraintError } from '~~/server/utils/transfer-payment-unique-constraint-errors'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const transferPaymentId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  if (!transferPaymentId || !streamId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  const streamContext = await resolveTransferPaymentAgreementSubtypeStreamScopeContext(transferPaymentId, streamId, db)
  if (!streamContext) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  await authorize(event, 'transfer_payment', 'create', createTransferPaymentScopedAuthorizeHandler('create', streamContext.scope, db))
  const body = await readValidatedBodyI18n(event, TransferPaymentStreamDocumentTemplateLinkSchema)
  return await executeFreshAuthorizedTransferPaymentStreamWrite(
    event, db, transferPaymentId, streamContext.agencyId, streamId, 'create', async (trx, freshContext) => {
      const definition = await trx.selectFrom('Agency_Document_Template')
        .where('id', '=', body.egcs_tp_agencydocumenttemplate)
        .where('egcs_ay_organizationagency', '=', freshContext.agencyId)
        .where('egcs_ay_active', '=', true)
        .where('_deleted', '=', false)
        .select('id').executeTakeFirst()
      if (!definition) return await notFound(event, 'DOCUMENT_TEMPLATE_NOT_FOUND', 'apiErrors.document_generation.template_not_found')
      try {
        return await trx.insertInto('Transfer_Payment_Stream_Document_Template').values({
          egcs_tp_transferpaymentstream: streamId,
          egcs_tp_agencydocumenttemplate: String(definition.id)
        }).returningAll().executeTakeFirstOrThrow()
      } catch (error) {
        return await throwIfTransferPaymentUniqueConstraintError(event, error)
      }
    }
  )
})
