import { create as contentDisposition } from 'content-disposition'
import { setResponseHeader } from 'h3'
import { z } from 'zod'
import { authorize } from '~~/server/utils/authorize'
import { badRequest, notFound, throwApiError } from '~~/server/utils/api-errors'
import { readStoredFile } from '~~/server/utils/file-storage'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { LANGUAGE_PREFERENCE_ENUM } from '~~/shared/constants/enums'

const QuerySchema = z.object({ language: z.enum(LANGUAGE_PREFERENCE_ENUM).default('eng') }).strict()

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'agencyId')
  const templateId = getRouterParam(event, 'templateId')
  if (!agencyId || !templateId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  if (![agencyId, templateId].every(isPositivePostgresBigintText)) return await notFound(event, 'DOCUMENT_TEMPLATE_NOT_FOUND', 'apiErrors.document_generation.template_not_found')
  await authorize(event, 'agency', 'read', { type: 'agency', agencyId })
  const { language } = await getValidatedQueryI18n(event, QuerySchema)
  const template = await event.context.$db.selectFrom('Agency_Document_Template')
    .where('id', '=', templateId).where('egcs_ay_organizationagency', '=', agencyId)
    .where('_deleted', '=', false)
    .select(['egcs_ay_templateattachment_en', 'egcs_ay_templateattachment_fr']).executeTakeFirst()
  if (!template) return await notFound(event, 'DOCUMENT_TEMPLATE_NOT_FOUND', 'apiErrors.document_generation.template_not_found')
  const attachmentId = language === 'fra' ? template.egcs_ay_templateattachment_fr : template.egcs_ay_templateattachment_en
  const attachment = await event.context.$db.selectFrom('Common_Attachment')
    .where('id', '=', attachmentId).where('_deleted', '=', false)
    .select(['egcs_cn_provider', 'egcs_cn_providerobjectid', 'egcs_cn_providerlocator', 'egcs_cn_filename', 'egcs_cn_mimetype'])
    .executeTakeFirst()
  if (!attachment?.egcs_cn_provider || !attachment.egcs_cn_providerobjectid || !attachment.egcs_cn_providerlocator || !attachment.egcs_cn_filename || !attachment.egcs_cn_mimetype) {
    return await notFound(event, 'DOCUMENT_TEMPLATE_NOT_FOUND', 'apiErrors.document_generation.template_not_found')
  }
  let bytes: Buffer
  try {
    bytes = await readStoredFile(event.context.$db, agencyId, attachment)
  } catch {
    return await throwApiError(event, { statusCode: 503, code: 'DOCUMENT_STORAGE_READ_FAILED', key: 'apiErrors.document_generation.storage_unavailable' })
  }
  setResponseHeader(event, 'Content-Type', attachment.egcs_cn_mimetype)
  setResponseHeader(event, 'Content-Disposition', contentDisposition(attachment.egcs_cn_filename))
  setResponseHeader(event, 'Content-Length', bytes.byteLength)
  setResponseHeader(event, 'X-Content-Type-Options', 'nosniff')
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  return bytes
})
