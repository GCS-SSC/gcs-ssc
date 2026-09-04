import { badRequest, notFound } from '~~/server/utils/api-errors'
import {
  authorizeApprovalTemplateById,
  executeApprovalTemplateScopeWrite,
  resolveApprovalTemplateScopeContextFromTemplateId
} from '~~/server/utils/approval-template-scope'
import { getApprovalTemplate, softDeleteApprovalTemplate } from '~~/server/utils/approval-templates'
import { requireAuthContext } from '~~/server/utils/authorize'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const templateId = getRouterParam(event, 'templateId')
  if (!templateId) {
    return await badRequest(event, 'MISSING_APPROVAL_TEMPLATE_ID', 'apiErrors.request.missing_id')
  }

  const scopeContext = await authorizeApprovalTemplateById(event, 'delete', templateId)
  await executeApprovalTemplateScopeWrite(event, 'delete', scopeContext, async trx => {
    const currentScopeContext = await resolveApprovalTemplateScopeContextFromTemplateId(trx, templateId)
    if (!currentScopeContext || currentScopeContext.scopeId !== scopeContext.scopeId) {
      return await notFound(event, 'APPROVAL_TEMPLATE_NOT_FOUND', 'apiErrors.admin_common.not_found')
    }
    const template = await getApprovalTemplate(trx, templateId)
    if (!template) {
      return await notFound(event, 'APPROVAL_TEMPLATE_NOT_FOUND', 'apiErrors.admin_common.not_found')
    }
    if (template.publicationState !== 'draft') {
      return await badRequest(event, 'APPROVAL_TEMPLATE_NOT_DRAFT', 'apiErrors.request.invalid_status')
    }
    await softDeleteApprovalTemplate(trx, templateId)
  })

  return { ok: true }
})
