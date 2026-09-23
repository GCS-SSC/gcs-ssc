import { authorize } from '~~/server/utils/authorize'
import { withActiveAgencyReadTransaction } from '~~/server/utils/agency-auth'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'agencyId')
  const templateId = getRouterParam(event, 'templateId')
  if (!agencyId || !templateId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  if (![agencyId, templateId].every(isPositivePostgresBigintText)) {
    return await notFound(event, 'DOCUMENT_TEMPLATE_NOT_FOUND', 'apiErrors.document_generation.template_not_found')
  }
  await authorize(event, 'agency', 'read', { type: 'agency', agencyId })
  return await withActiveAgencyReadTransaction(event, agencyId, async trx => {
    const template = await trx.selectFrom('Agency_Document_Template')
      .innerJoin('Common_Attachment as AttachmentEn', 'AttachmentEn.id', 'Agency_Document_Template.egcs_ay_templateattachment_en')
      .innerJoin('Common_Attachment as AttachmentFr', 'AttachmentFr.id', 'Agency_Document_Template.egcs_ay_templateattachment_fr')
      .where('Agency_Document_Template.id', '=', templateId)
      .where('Agency_Document_Template.egcs_ay_organizationagency', '=', agencyId)
      .where('Agency_Document_Template._deleted', '=', false)
      .selectAll('Agency_Document_Template')
      .select([
        'AttachmentEn.egcs_cn_name_en as attachment_en_name_en',
        'AttachmentFr.egcs_cn_name_fr as attachment_fr_name_fr'
      ])
      .executeTakeFirst()
    return template ?? await notFound(event, 'DOCUMENT_TEMPLATE_NOT_FOUND', 'apiErrors.document_generation.template_not_found')
  })
})
