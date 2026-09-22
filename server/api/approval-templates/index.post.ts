import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { ApprovalTemplateCreateSchema } from '~~/shared/types/schemas'
import {
  assertApprovalTemplateScopeSupported,
  authorizeApprovalTemplateScope,
  executeApprovalTemplateScopeWrite
} from '~~/server/utils/approval-template-scope'
import { getApprovalTemplate, syncApprovalTemplate } from '~~/server/utils/approval-templates'
import { requireAuthContext } from '~~/server/utils/authorize'
import { assertApprovalTemplateGroups } from '~~/server/utils/approval-template-groups'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const body = await readValidatedBodyI18n(event, ApprovalTemplateCreateSchema)
  const unsupportedScopeResult = await assertApprovalTemplateScopeSupported(event, body.scopeType)

  if (unsupportedScopeResult) {
    return unsupportedScopeResult
  }

  const scopeContext = await authorizeApprovalTemplateScope(event, 'create', body.scopeType, body.scopeId)

  const saved = await executeApprovalTemplateScopeWrite(event, 'create', scopeContext, async trx => {
    await assertApprovalTemplateGroups(event, trx, scopeContext.agencyId, body.steps.map(step => step.egcs_cn_defaultgroup))
    const template = await syncApprovalTemplate(trx, {
      scopeType: body.scopeType,
      scopeId: body.scopeId,
      payload: body
    })
    return await getApprovalTemplate(trx, String(template.id))
  })

  return saved
})
