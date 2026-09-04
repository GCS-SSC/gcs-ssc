import { badRequest, notFound } from '~~/server/utils/api-errors'
import { resolveCurrentCommonUser } from '~~/server/utils/additional-reviewer-runtime'
import { authorizeApprovalTemplateById, executeApprovalTemplateScopeWrite } from '~~/server/utils/approval-template-scope'
import { retireApprovalTemplate } from '~~/server/utils/approval-template-versioning'
import { getApprovalTemplate } from '~~/server/utils/approval-templates'
import { requireAuthContext } from '~~/server/utils/authorize'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const templateId = getRouterParam(event, 'templateId')
  if (!templateId) return await badRequest(event, 'MISSING_APPROVAL_TEMPLATE_ID', 'apiErrors.request.missing_id')
  const context = await authorizeApprovalTemplateById(event, 'update', templateId)
  return await executeApprovalTemplateScopeWrite(event, 'update', context, async trx => {
    const actor = await resolveCurrentCommonUser(event, trx)
    if (!actor) return await notFound(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')
    await retireApprovalTemplate(trx, templateId, actor.id)
    return await getApprovalTemplate(trx, templateId)
  })
})
