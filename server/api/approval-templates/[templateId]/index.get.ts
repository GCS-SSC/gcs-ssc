import { badRequest, notFound } from '~~/server/utils/api-errors'
import {
  authorizeApprovalTemplateById
} from '~~/server/utils/approval-template-scope'
import { getApprovalTemplate } from '~~/server/utils/approval-templates'
import { requireAuthContext } from '~~/server/utils/authorize'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const templateId = getRouterParam(event, 'templateId')
  if (!templateId) {
    return await badRequest(event, 'MISSING_APPROVAL_TEMPLATE_ID', 'apiErrors.request.missing_id')
  }

  await authorizeApprovalTemplateById(event, 'read', templateId)

  const template = await getApprovalTemplate(event.context.$db, templateId)
  if (!template) {
    return await notFound(event, 'APPROVAL_TEMPLATE_NOT_FOUND', 'apiErrors.admin_common.not_found')
  }

  return template
})
