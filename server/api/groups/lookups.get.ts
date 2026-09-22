import { z } from 'zod'
import { authorize } from '~~/server/utils/authorize'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { PositivePostgresBigintIdSchema } from '~~/shared/types/schemas/common'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { notFound } from '~~/server/utils/api-errors'
import { authorizeApprovalTemplateById } from '~~/server/utils/approval-template-scope'

const Query = z.object({ agencyId: PositivePostgresBigintIdSchema.optional(), approvalTemplateId: PositivePostgresBigintIdSchema.optional(), search: z.string().optional() })

export default defineEventHandler(async event => {
  const { approvalTemplateId, search, agencyId: requestedAgencyId } = await getValidatedQueryI18n(event, Query)
  let agencyId = requestedAgencyId
  if (approvalTemplateId) {
    const authorized = await authorizeApprovalTemplateById(event, 'update', approvalTemplateId)
    const template = await event.context.$db.selectFrom('Common_Approval_Template')
      .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.id', 'Common_Approval_Template.egcs_cn_scopeid')
      .innerJoin('Transfer_Payment_Profile', 'Transfer_Payment_Profile.id', 'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile')
      .select('Transfer_Payment_Profile.egcs_tp_agency as agencyId')
      .where('Common_Approval_Template.id', '=', approvalTemplateId)
      .where('Common_Approval_Template._deleted', '=', false)
      .where('Transfer_Payment_Stream._deleted', '=', false)
      .where('Transfer_Payment_Profile._deleted', '=', false).executeTakeFirst()
    if (!template) return await notFound(event, 'APPROVAL_TEMPLATE_NOT_FOUND', 'apiErrors.admin_common.not_found')
    agencyId = String(template.agencyId)
    if (agencyId !== authorized.agencyId) return await notFound(event, 'APPROVAL_TEMPLATE_NOT_FOUND', 'apiErrors.admin_common.not_found')
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
