import { z } from 'zod'
import { authorize } from '~~/server/utils/authorize'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { PositivePostgresBigintIdSchema } from '~~/shared/types/schemas/common'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { notFound } from '~~/server/utils/api-errors'
import { authorizeApprovalTemplateById, resolveApprovalTemplateScopeContextFromTemplateId } from '~~/server/utils/approval-template-scope'

const Query = z.object({ agencyId: PositivePostgresBigintIdSchema.optional(), approvalTemplateId: PositivePostgresBigintIdSchema.optional(), search: z.string().optional() })

export default defineEventHandler(async event => {
  const { approvalTemplateId, search, agencyId: requestedAgencyId } = await getValidatedQueryI18n(event, Query)
  let agencyId = requestedAgencyId
  if (approvalTemplateId) {
    const scope = await resolveApprovalTemplateScopeContextFromTemplateId(event.context.$db, approvalTemplateId)
    if (!scope) return await notFound(event, 'APPROVAL_TEMPLATE_NOT_FOUND', 'apiErrors.admin_common.not_found')
    const authorized = await authorizeApprovalTemplateById(event, 'update', scope.agencyId, approvalTemplateId)
    agencyId = authorized.agencyId
  }
  if (!agencyId) return await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.admin_common.not_found')
  if (!approvalTemplateId) await authorize(event, 'group', 'read', { type: 'agency', agencyId })
  const rows = await event.context.$db.selectFrom('Common_Group')
    .select(['id', 'egcs_cn_name_en', 'egcs_cn_name_fr', 'egcs_cn_email'])
    .where('egcs_cn_agency', '=', agencyId).where('_deleted', '=', false)
    .$if(Boolean(search), query => query.where('egcs_cn_name_en', 'ilike', `%${escapeLikePattern(search ?? '')}%`))
    .orderBy('egcs_cn_name_en').limit(100).execute()
  return { items: rows.map(row => ({ ...row, id: String(row.id) })) }
})
