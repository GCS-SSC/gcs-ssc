import { requireAuthContext } from '~~/server/utils/authorize'
import { requireFundingOpportunityAccess } from '~~/server/utils/funding-case-access'
import { notFound } from '~~/server/utils/api-errors'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const id = getRouterParam(event, 'id')
  if (!id) return await notFound(event, 'FUNDING_OPPORTUNITY_NOT_FOUND', 'apiErrors.admin_common.not_found')
  const db = event.context.$db
  const scope = await requireFundingOpportunityAccess(event, id, 'read', db)
  const opportunity = await db.selectFrom('Funding_Opportunity_Profile')
    .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.id', 'Funding_Opportunity_Profile.egcs_fo_transferpaymentstream')
    .selectAll('Funding_Opportunity_Profile')
    .select(['Transfer_Payment_Stream.egcs_tp_name_en as stream_name_en', 'Transfer_Payment_Stream.egcs_tp_name_fr as stream_name_fr'])
    .where('Funding_Opportunity_Profile.id', '=', id).where('Funding_Opportunity_Profile._deleted', '=', false).executeTakeFirst()
  if (!opportunity) return await notFound(event, 'FUNDING_OPPORTUNITY_NOT_FOUND', 'apiErrors.admin_common.not_found')
  const [reviews, workflows] = await Promise.all([
    db.selectFrom('Funding_Opportunity_Review_Set')
      .innerJoin('Common_Review_Set_Setup', 'Common_Review_Set_Setup.id', 'Funding_Opportunity_Review_Set.egcs_fo_reviewsetsetup')
      .select(['egcs_fo_reviewsetsetup', 'Common_Review_Set_Setup.egcs_cn_name_en as name_en', 'Common_Review_Set_Setup.egcs_cn_name_fr as name_fr'])
      .where('egcs_fo_fundingopportunity', '=', id).where('Funding_Opportunity_Review_Set._deleted', '=', false).execute(),
    db.selectFrom('Funding_Opportunity_Workflow')
      .innerJoin('Common_Workflow_Setup', 'Common_Workflow_Setup.id', 'Funding_Opportunity_Workflow.egcs_fo_workflowsetup')
      .select(['egcs_fo_workflowsetup', 'Common_Workflow_Setup.egcs_cn_name_en as name_en', 'Common_Workflow_Setup.egcs_cn_name_fr as name_fr'])
      .where('egcs_fo_fundingopportunity', '=', id).where('Funding_Opportunity_Workflow._deleted', '=', false).execute()
  ])
  return {
    ...opportunity,
    agency_id: scope.agencyId,
    program_id: scope.transferPaymentId,
    egcs_fo_reviewsetups: reviews.map(row => String(row.egcs_fo_reviewsetsetup)),
    egcs_fo_workflowsetups: workflows.map(row => String(row.egcs_fo_workflowsetup)),
    review_setups: reviews.map(row => ({ id: String(row.egcs_fo_reviewsetsetup), name_en: row.name_en, name_fr: row.name_fr })),
    workflow_setups: workflows.map(row => ({ id: String(row.egcs_fo_workflowsetup), name_en: row.name_en, name_fr: row.name_fr }))
  }
})
