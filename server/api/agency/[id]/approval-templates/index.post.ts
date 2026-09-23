import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { ApprovalTemplateCreateSchema } from '~~/shared/types/schemas'
import { authorizeApprovalTemplateScope, executeApprovalTemplateScopeWrite } from '~~/server/utils/approval-template-scope'
import { getApprovalTemplate, syncApprovalTemplate } from '~~/server/utils/approval-templates'
import { requireAuthContext } from '~~/server/utils/authorize'
import { assertApprovalTemplateGroups } from '~~/server/utils/approval-template-groups'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const agencyId = getRouterParam(event, 'id') ?? ''
  const scopeContext = await authorizeApprovalTemplateScope(event, 'create', agencyId)
  const body = await readValidatedBodyI18n(event, ApprovalTemplateCreateSchema)

  const saved = await executeApprovalTemplateScopeWrite(event, 'create', scopeContext, async trx => {
    await assertApprovalTemplateGroups(event, trx, agencyId, body.steps.map(step => step.egcs_cn_defaultgroup))
    const template = await syncApprovalTemplate(trx, {
      agencyId,
      payload: body
    })
    return await getApprovalTemplate(trx, String(template.id))
  })

  return saved
})
