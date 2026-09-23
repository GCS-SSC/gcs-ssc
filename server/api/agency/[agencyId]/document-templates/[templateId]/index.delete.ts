import { authorize } from '~~/server/utils/authorize'
import { withActiveAgencyMutationTransaction } from '~~/server/utils/agency-auth'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'agencyId')
  const templateId = getRouterParam(event, 'templateId')
  if (!agencyId || !templateId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  if (![agencyId, templateId].every(isPositivePostgresBigintText)) return await notFound(event, 'DOCUMENT_TEMPLATE_NOT_FOUND', 'apiErrors.document_generation.template_not_found')
  await authorize(event, 'agency', 'delete', { type: 'agency', agencyId })
  return await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
    const result = await trx.updateTable('Agency_Document_Template')
      .set({ _deleted: true }).where('id', '=', templateId)
      .where('egcs_ay_organizationagency', '=', agencyId)
      .where('_deleted', '=', false).returningAll().executeTakeFirst()
    if (!result) return await notFound(event, 'DOCUMENT_TEMPLATE_NOT_FOUND', 'apiErrors.document_generation.template_not_found')
    return result
  }, 'delete')
})
