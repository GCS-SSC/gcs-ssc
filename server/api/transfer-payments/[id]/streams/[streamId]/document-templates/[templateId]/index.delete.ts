import { authorize } from '~~/server/utils/authorize'
import { createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { resolveTransferPaymentAgreementSubtypeStreamScopeContext } from '~~/server/utils/transfer-payment-agreement-subtypes'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'
import { deleteStoredFile } from '~~/server/utils/file-storage'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const transferPaymentId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  const templateId = getRouterParam(event, 'templateId')
  if (!transferPaymentId || !streamId || !templateId) {
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  }
  if (![transferPaymentId, streamId, templateId].every(isPositivePostgresBigintText)) {
    return await badRequest(event, 'INVALID_IDS', 'apiErrors.request.invalid')
  }

  const streamContext = await resolveTransferPaymentAgreementSubtypeStreamScopeContext(transferPaymentId, streamId, db)
  if (!streamContext) {
    return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }

  await authorize(event, 'transfer_payment', 'delete', createTransferPaymentScopedAuthorizeHandler('delete', streamContext.scope, db))

  const deletion = await executeFreshAuthorizedTransferPaymentStreamWrite(
    event, db, transferPaymentId, streamContext.agencyId, streamId, 'delete', async trx => {
      const template = await trx
        .selectFrom('Transfer_Payment_Stream_Document_Template')
        .where('id', '=', templateId)
        .where('egcs_tp_transferpaymentstream', '=', streamId)
        .where('_deleted', '=', false)
        .select(['egcs_tp_templateattachment_en', 'egcs_tp_templateattachment_fr'])
        .executeTakeFirst()
      if (!template) {
        return {
          attachments: [],
          response: await notFound(event, 'DOCUMENT_TEMPLATE_NOT_FOUND', 'apiErrors.document_generation.template_not_found')
        }
      }

      const attachmentIds = [...new Set([
        String(template.egcs_tp_templateattachment_en),
        String(template.egcs_tp_templateattachment_fr)
      ])]
      const activeReferences = await trx
        .selectFrom('Transfer_Payment_Stream_Document_Template')
        .where('id', '!=', templateId)
        .where('_deleted', '=', false)
        .where(eb => eb.or([
          eb('egcs_tp_templateattachment_en', 'in', attachmentIds),
          eb('egcs_tp_templateattachment_fr', 'in', attachmentIds)
        ]))
        .select(['egcs_tp_templateattachment_en', 'egcs_tp_templateattachment_fr'])
        .execute()
      const referencedAttachmentIds = new Set(activeReferences.flatMap(reference => [
        String(reference.egcs_tp_templateattachment_en),
        String(reference.egcs_tp_templateattachment_fr)
      ]))
      const retiredAttachmentIds = attachmentIds.filter(attachmentId => !referencedAttachmentIds.has(attachmentId))
      const attachments = retiredAttachmentIds.length > 0
        ? await trx
            .selectFrom('Common_Attachment')
            .where('id', 'in', retiredAttachmentIds)
            .where('_deleted', '=', false)
            .select(['id', 'egcs_cn_provider', 'egcs_cn_providerobjectid', 'egcs_cn_providerlocator'])
            .execute()
        : []
      const result = await trx.updateTable('Transfer_Payment_Stream_Document_Template')
        .set({ _deleted: true })
        .where('id', '=', templateId)
        .where('egcs_tp_transferpaymentstream', '=', streamId)
        .where('_deleted', '=', false)
        .returningAll()
        .executeTakeFirst()
      if (!result) {
        return {
          attachments: [],
          response: await notFound(event, 'DOCUMENT_TEMPLATE_NOT_FOUND', 'apiErrors.document_generation.template_not_found')
        }
      }
      if (retiredAttachmentIds.length > 0) {
        await trx
          .updateTable('Common_Attachment')
          .set({ _deleted: true })
          .where('id', 'in', retiredAttachmentIds)
          .where('_deleted', '=', false)
          .execute()
      }
      return { attachments, response: result }
    }
  )

  const cleanupResults = await Promise.allSettled(deletion.attachments.map(attachment =>
    deleteStoredFile(db, String(streamContext.agencyId), attachment)
  ))
  cleanupResults.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error('Failed to clean up deleted document-template attachment.', {
        templateId,
        attachmentId: deletion.attachments[index]?.id,
        category: 'storage_cleanup_failed'
      })
    }
  })
  return deletion.response
})
