import { defineEventHandler, getRouterParam } from 'h3'
import { parseI18n } from '~~/server/utils/api-validate'
import { ApprovalTemplateCreateSchema, type ApprovalTemplateCreateInput } from '~~/shared/types/schemas'
import { PortableApprovalImportSchema } from '~~/shared/utils/portable-authoring-schema'
import { readPortableAuthoringCreate, withPortableAuthoringImport } from '~~/server/utils/portable-authoring-import'
import { prepareApprovalImport } from '~~/server/utils/portable-authoring-references'
import { authorizeApprovalTemplateScope, executeApprovalTemplateScopeWrite } from '~~/server/utils/approval-template-scope'
import { getApprovalTemplate, syncApprovalTemplate } from '~~/server/utils/approval-templates'
import { requireAuthContext } from '~~/server/utils/authorize'
import { assertApprovalTemplateGroups } from '~~/server/utils/approval-template-groups'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const agencyId = getRouterParam(event, 'agencyId') ?? ''
  const scopeContext = await authorizeApprovalTemplateScope(event, 'create', agencyId)
  const request = await readPortableAuthoringCreate(event, ApprovalTemplateCreateSchema, PortableApprovalImportSchema)

  const saved = await executeApprovalTemplateScopeWrite(event, 'create', scopeContext, async trx => {
    /**
     * Persists a validated approval template inside its Agency transaction.
     * @param body Creation fields validated by the canonical schema.
     * @returns The saved template and its steps.
     */
    const create = async (body: ApprovalTemplateCreateInput) => {
      await assertApprovalTemplateGroups(event, trx, agencyId, body.steps.map(step => step.egcs_cn_defaultgroup))
      const template = await syncApprovalTemplate(trx, {
        agencyId,
        payload: body
      })
      return await getApprovalTemplate(trx, String(template.id))
    }
    if ('portable' in request) {
      return await withPortableAuthoringImport(
        event, trx, agencyId, request,
        async (definition, removed) => await prepareApprovalImport(trx, agencyId, definition, removed),
        async definition => {
          const template = await create(await parseI18n(event, ApprovalTemplateCreateSchema, definition.payload))
          if (!template) throw new Error('Created approval template could not be read')
          return template
        }
      )
    }
    return await create(request)
  })

  return saved
})
