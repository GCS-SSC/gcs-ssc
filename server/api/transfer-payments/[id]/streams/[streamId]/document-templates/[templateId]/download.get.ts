import { create as contentDisposition } from 'content-disposition'
import { setResponseHeader } from 'h3'
import { authorize } from '~~/server/utils/authorize'
import { notFound, throwApiError } from '~~/server/utils/api-errors'
import { readStoredFile } from '~~/server/utils/file-storage'
import { createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { resolveTransferPaymentAgreementSubtypeStreamScopeContext } from '~~/server/utils/transfer-payment-agreement-subtypes'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { LANGUAGE_PREFERENCE_ENUM } from '~~/shared/constants/enums'
import { z } from 'zod'

export const DocumentTemplateDownloadQuerySchema = z.object({
  language: z.enum(LANGUAGE_PREFERENCE_ENUM, { error: 'validation.invalid_selection' }).default('eng')
}).strict()

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
  const { language } = await getValidatedQueryI18n(event, DocumentTemplateDownloadQuerySchema)

  const streamContext = await resolveTransferPaymentAgreementSubtypeStreamScopeContext(transferPaymentId, streamId, db)
  if (!streamContext) {
    return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }

  await authorize(event, 'transfer_payment', 'read', createTransferPaymentScopedAuthorizeHandler('read', streamContext.scope, db))

  const template = await db
    .selectFrom('Transfer_Payment_Stream_Document_Template')
    .where('id', '=', templateId)
    .where('egcs_tp_transferpaymentstream', '=', streamId)
    .where('_deleted', '=', false)
    .select([
      'egcs_tp_templateattachment_en',
      'egcs_tp_templateattachment_fr'
    ])
    .executeTakeFirst()

  if (!template) {
    return await notFound(event, 'DOCUMENT_TEMPLATE_NOT_FOUND', 'apiErrors.document_generation.template_not_found')
  }

  const attachmentId = language === 'fra'
    ? template.egcs_tp_templateattachment_fr
    : template.egcs_tp_templateattachment_en
  const attachment = await db
    .selectFrom('Common_Attachment')
    .where('id', '=', attachmentId)
    .where('_deleted', '=', false)
    .select([
      'egcs_cn_provider',
      'egcs_cn_providerobjectid',
      'egcs_cn_providerlocator',
      'egcs_cn_name_en',
      'egcs_cn_name_fr',
      'egcs_cn_filename',
      'egcs_cn_mimetype'
    ])
    .executeTakeFirst()

  if (!attachment) {
    return await notFound(event, 'DOCUMENT_TEMPLATE_NOT_FOUND', 'apiErrors.document_generation.template_not_found')
  }

  const filename = attachment.egcs_cn_filename
  if (
    !attachment.egcs_cn_provider ||
    !attachment.egcs_cn_providerobjectid ||
    !attachment.egcs_cn_providerlocator ||
    !attachment.egcs_cn_mimetype ||
    !filename
  ) {
    return await notFound(event, 'DOCUMENT_TEMPLATE_NOT_FOUND', 'apiErrors.document_generation.template_not_found')
  }

  let bytes: Buffer
  try {
    bytes = await readStoredFile(db, String(streamContext.agencyId), attachment)
  } catch {
    return await throwApiError(event, {
      statusCode: 503,
      code: 'DOCUMENT_STORAGE_READ_FAILED',
      key: 'apiErrors.document_generation.storage_unavailable'
    })
  }

  setResponseHeader(event, 'Content-Type', attachment.egcs_cn_mimetype)
  setResponseHeader(event, 'Content-Disposition', contentDisposition(filename))
  setResponseHeader(event, 'Content-Length', bytes.byteLength)
  setResponseHeader(event, 'X-Content-Type-Options', 'nosniff')
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  return bytes
})
