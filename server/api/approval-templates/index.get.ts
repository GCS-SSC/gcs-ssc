import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import {
  assertApprovalTemplateScopeSupported,
  authorizeApprovalTemplateScope
} from '~~/server/utils/approval-template-scope'
import { listApprovalTemplates } from '~~/server/utils/approval-templates'
import { ApprovalTemplateListQuerySchema } from '~~/shared/types/schemas'
import { requireAuthContext } from '~~/server/utils/authorize'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const { page, limit, search, scopeType, scopeId } = await getValidatedQueryI18n(event, ApprovalTemplateListQuerySchema)
  const unsupportedScopeResult = await assertApprovalTemplateScopeSupported(event, scopeType)

  if (unsupportedScopeResult) {
    return unsupportedScopeResult
  }

  await authorizeApprovalTemplateScope(event, 'read', scopeType, scopeId)

  const normalizedSearch = search ? search.toLowerCase() : ''
  const allItems = await listApprovalTemplates(event.context.$db, scopeType, scopeId)

  const filteredItems = normalizedSearch
    ? allItems.filter(item => {
        const haystack = [
          item.egcs_cn_name_en,
          item.egcs_cn_name_fr,
          item.egcs_cn_description_en,
          item.egcs_cn_description_fr,
          ...item.steps.flatMap(step => [
            step.egcs_cn_name_en,
            step.egcs_cn_name_fr,
            step.egcs_cn_description_en,
            step.egcs_cn_description_fr,
            step.egcs_cn_approvertitle,
            ...step.certifications.flatMap(certification => [
              certification.egcs_cn_name_en,
              certification.egcs_cn_name_fr,
              certification.egcs_cn_description_en,
              certification.egcs_cn_description_fr,
              certification.egcs_cn_certification_en,
              certification.egcs_cn_certification_fr
            ])
          ])
        ].join(' ').toLowerCase()

        return haystack.includes(normalizedSearch)
      })
    : allItems

  const offset = (page - 1) * limit
  const items = filteredItems.slice(offset, offset + limit)
  const total = filteredItems.length

  return {
    items,
    total,
    stats: {
      total,
      draft: filteredItems.filter(item => item.publicationState === 'draft').length,
      published: filteredItems.filter(item => item.publicationState === 'published').length,
      retired: filteredItems.filter(item => item.publicationState === 'retired').length
    },
    page,
    limit
  }
})
