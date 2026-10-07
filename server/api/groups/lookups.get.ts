import { z } from 'zod'
import { authorize } from '~~/server/utils/authorize'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { PositivePostgresBigintIdSchema } from '~~/shared/types/schemas/common'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { notFound } from '~~/server/utils/api-errors'
import { authorizeApprovalTemplateById, resolveApprovalTemplateScopeContextFromTemplateId } from '~~/server/utils/approval-template-scope'
import { authorizeAgencyWorkflowSetup } from '~~/server/utils/agency-workflow-authorization'

const Query = z.object({
  agencyId: PositivePostgresBigintIdSchema.optional(),
  approvalTemplateId: PositivePostgresBigintIdSchema.optional(),
  workflowSetupId: PositivePostgresBigintIdSchema.optional(),
  selectedIds: z.union([PositivePostgresBigintIdSchema, z.array(PositivePostgresBigintIdSchema).min(1, { error: 'validation.required' }).max(100, { error: 'validation.max_items' })])
    .transform(value => [...new Set(Array.isArray(value) ? value : [value])]).optional(),
  search: z.string().optional()
}).refine(query => !(query.approvalTemplateId && query.workflowSetupId), { error: 'validation.invalid_selection' })

export default defineEventHandler(async event => {
  const { approvalTemplateId, workflowSetupId, selectedIds, search, agencyId: requestedAgencyId } = await getValidatedQueryI18n(event, Query)
  let agencyId = requestedAgencyId
  if (approvalTemplateId) {
    const scope = await resolveApprovalTemplateScopeContextFromTemplateId(event.context.$db, approvalTemplateId)
    if (!scope) return await notFound(event, 'APPROVAL_TEMPLATE_NOT_FOUND', 'apiErrors.admin_common.not_found')
    const authorized = await authorizeApprovalTemplateById(event, 'update', scope.agencyId, approvalTemplateId)
    agencyId = authorized.agencyId
  } else if (workflowSetupId) {
    const setup = await event.context.$db.selectFrom('Common_Workflow_Setup')
      .innerJoin('Agency_Profile', 'Agency_Profile.id', 'Common_Workflow_Setup.egcs_cn_agency')
      .select('Common_Workflow_Setup.egcs_cn_agency as agencyId')
      .where('Common_Workflow_Setup.id', '=', workflowSetupId)
      .where('Common_Workflow_Setup._deleted', '=', false).where('Agency_Profile._deleted', '=', false)
      .executeTakeFirst()
    if (!setup) return await notFound(event, 'WORKFLOW_SETUP_NOT_FOUND', 'apiErrors.admin_common.not_found')
    agencyId = await authorizeAgencyWorkflowSetup(event, 'update', String(setup.agencyId), workflowSetupId)
  }
  if (!agencyId) return await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.admin_common.not_found')
  if (!approvalTemplateId && !workflowSetupId) await authorize(event, 'group', 'read', { type: 'agency', agencyId })
  const rows = await event.context.$db.selectFrom('Common_Group')
    .select(['id', 'egcs_cn_name_en', 'egcs_cn_name_fr', 'egcs_cn_email'])
    .where('egcs_cn_agency', '=', agencyId).where('_deleted', '=', false)
    .$if(Boolean(workflowSetupId) && !selectedIds, query => query.where(eb => eb.exists(eb
      .selectFrom('Common_Group_Member')
      .innerJoin('Common_User', 'Common_User.id', 'Common_Group_Member.egcs_cn_user')
      .innerJoin('user', 'user.id', 'Common_User.egcs_cn_auth_user_id')
      .select('Common_Group_Member.id')
      .whereRef('Common_Group_Member.egcs_cn_group', '=', 'Common_Group.id')
      .where('Common_Group_Member._deleted', '=', false)
      .where('Common_User._deleted', '=', false).where('user._deleted', '=', false))))
    .$if(Boolean(selectedIds), query => query.where('id', 'in', selectedIds ?? []))
    .$if(Boolean(search), query => query.where(eb => eb.or([
      eb('egcs_cn_name_en', 'ilike', `%${escapeLikePattern(search ?? '')}%`),
      eb('egcs_cn_name_fr', 'ilike', `%${escapeLikePattern(search ?? '')}%`)
    ])))
    .orderBy('egcs_cn_name_en').limit(100).execute()
  return { items: rows.map(row => ({ ...row, id: String(row.id) })) }
})
