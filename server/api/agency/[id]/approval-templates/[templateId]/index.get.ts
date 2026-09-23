import { badRequest, notFound } from '~~/server/utils/api-errors'
import {
  authorizeApprovalTemplateById,
  resolveApprovalTemplateScopeContextFromTemplateId
} from '~~/server/utils/approval-template-scope'
import { getApprovalTemplate } from '~~/server/utils/approval-templates'
import { requireAuthContext } from '~~/server/utils/authorize'
import { withActiveAgencyReadTransaction } from '~~/server/utils/agency-auth'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const templateId = getRouterParam(event, 'templateId')
  if (!templateId) {
    return await badRequest(event, 'MISSING_APPROVAL_TEMPLATE_ID', 'apiErrors.request.missing_id')
  }

  const agencyId = getRouterParam(event, 'id') ?? ''
  await authorizeApprovalTemplateById(event, 'read', agencyId, templateId)

  return await withActiveAgencyReadTransaction(event, agencyId, async trx => {
    const scopeContext = await resolveApprovalTemplateScopeContextFromTemplateId(trx, templateId)
    if (!scopeContext || scopeContext.agencyId !== agencyId) {
      return await notFound(event, 'APPROVAL_TEMPLATE_NOT_FOUND', 'apiErrors.admin_common.not_found')
    }
    const template = await getApprovalTemplate(trx, templateId)
    return template ?? await notFound(event, 'APPROVAL_TEMPLATE_NOT_FOUND', 'apiErrors.admin_common.not_found')
  })
})
