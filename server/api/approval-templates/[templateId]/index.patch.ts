import { badRequest, notFound } from '~~/server/utils/api-errors'
import { parseI18n, readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { ApprovalTemplatePatchSchema, ApprovalTemplatePersistenceSchema } from '~~/shared/types/schemas'
import {
  authorizeApprovalTemplateById,
  executeApprovalTemplateScopeWrite,
  resolveApprovalTemplateScopeContextFromTemplateId
} from '~~/server/utils/approval-template-scope'
import {
  getApprovalTemplate,
  mergeApprovalTemplatePatch,
  syncApprovalTemplate
} from '~~/server/utils/approval-templates'
import { requireAuthContext } from '~~/server/utils/authorize'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const templateId = getRouterParam(event, 'templateId')
  if (!templateId) {
    return await badRequest(event, 'MISSING_APPROVAL_TEMPLATE_ID', 'apiErrors.request.missing_id')
  }

  const scopeContext = await authorizeApprovalTemplateById(event, 'update', templateId)

  const body = await readValidatedBodyI18n(event, ApprovalTemplatePatchSchema)

  const saved = await executeApprovalTemplateScopeWrite(event, 'update', scopeContext, async trx => {
    const currentScopeContext = await resolveApprovalTemplateScopeContextFromTemplateId(trx, templateId)
    const existing = await getApprovalTemplate(trx, templateId)
    if (!currentScopeContext || currentScopeContext.scopeId !== scopeContext.scopeId || !existing) {
      return await notFound(event, 'APPROVAL_TEMPLATE_NOT_FOUND', 'apiErrors.admin_common.not_found')
    }
    if (existing.publicationState === 'retired') {
      return await throwApiError(event, {
        statusCode: 409, code: 'PUBLICATION_RETIRED', key: 'apiErrors.request.invalid_status'
      })
    }

    const mergedPatch = mergeApprovalTemplatePatch(existing, body)
    if (!mergedPatch) {
      return await notFound(event, 'APPROVAL_TEMPLATE_NOT_FOUND', 'apiErrors.admin_common.not_found')
    }
    const merged = await parseI18n(event, ApprovalTemplatePersistenceSchema, mergedPatch)

    await syncApprovalTemplate(trx, {
      scopeType: scopeContext.scopeType,
      scopeId: scopeContext.scopeId,
      payload: merged,
      templateId
    })
    return await getApprovalTemplate(trx, templateId)
  })

  return saved
})
