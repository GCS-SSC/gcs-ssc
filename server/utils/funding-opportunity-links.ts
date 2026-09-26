/* eslint-disable jsdoc/require-param-description, jsdoc/require-returns -- internal setup reconciliation helpers */
import type { Kysely } from 'kysely'
import type { Database } from '~~/shared/types/database'

/**
 *
 * @param db
 * @param streamId
 * @param agencyId
 * @param reviewIds
 * @param workflowIds
 */
export const validateFundingOpportunityLinks = async (
  db: Kysely<Database>, streamId: string, agencyId: string,
  reviewIds: string[], workflowIds: string[]
): Promise<boolean> => {
  const [reviews, workflows] = await Promise.all([
    reviewIds.length
      ? db.selectFrom('Transfer_Payment_Stream_Review_Set')
          .innerJoin('Common_Review_Set_Setup', 'Common_Review_Set_Setup.id', 'Transfer_Payment_Stream_Review_Set.egcs_tp_reviewset')
          .select('Common_Review_Set_Setup.id')
          .where('Transfer_Payment_Stream_Review_Set.egcs_tp_transferpaymentstream', '=', streamId)
          .where('Common_Review_Set_Setup.egcs_cn_entitytype', '=', 'fundingcaseintake')
          .where('Common_Review_Set_Setup.egcs_cn_agency', '=', agencyId)
          .where('Transfer_Payment_Stream_Review_Set.egcs_tp_reviewset', 'in', reviewIds)
          .where('Transfer_Payment_Stream_Review_Set._deleted', '=', false)
          .where('Common_Review_Set_Setup._deleted', '=', false).execute()
      : [],
    workflowIds.length
      ? db.selectFrom('Transfer_Payment_Stream_Workflow')
          .innerJoin('Common_Workflow_Setup', 'Common_Workflow_Setup.id', 'Transfer_Payment_Stream_Workflow.egcs_tp_workflow')
          .select('Common_Workflow_Setup.id')
          .where('Transfer_Payment_Stream_Workflow.egcs_tp_transferpaymentstream', '=', streamId)
          .where('Common_Workflow_Setup.egcs_cn_entitytype', '=', 'fundingcaseintake')
          .where('Common_Workflow_Setup.egcs_cn_agency', '=', agencyId)
          .where('Transfer_Payment_Stream_Workflow.egcs_tp_workflow', 'in', workflowIds)
          .where('Transfer_Payment_Stream_Workflow._deleted', '=', false)
          .where('Common_Workflow_Setup._deleted', '=', false).execute()
      : []
  ])
  return new Set(reviews.map(row => String(row.id))).size === reviewIds.length
    && new Set(workflows.map(row => String(row.id))).size === workflowIds.length
}

/**
 * Reconciles active links while retaining soft-deleted history.
 * @param db
 * @param opportunityId
 * @param type
 * @param requestedIds
 */
export const replaceFundingOpportunityLinks = async (
  db: Kysely<Database>, opportunityId: string,
  type: 'review' | 'workflow', requestedIds: string[]
): Promise<void> => {
  if (type === 'review') {
    const existing = await db.selectFrom('Funding_Opportunity_Review_Set')
      .select(['id', 'egcs_fo_reviewsetsetup']).where('egcs_fo_fundingopportunity', '=', opportunityId)
      .where('_deleted', '=', false).forUpdate().execute()
    const requested = new Set(requestedIds)
    const current = new Set(existing.map(row => String(row.egcs_fo_reviewsetsetup)))
    const removals = existing.filter(row => !requested.has(String(row.egcs_fo_reviewsetsetup))).map(row => String(row.id))
    if (removals.length) await db.updateTable('Funding_Opportunity_Review_Set').set({ _deleted: true }).where('id', 'in', removals).execute()
    const additions = requestedIds.filter(id => !current.has(id))
    if (additions.length) await db.insertInto('Funding_Opportunity_Review_Set').values(additions.map(id => ({
      egcs_fo_fundingopportunity: opportunityId, egcs_fo_reviewsetsetup: id
    }))).execute()
    return
  }
  const existing = await db.selectFrom('Funding_Opportunity_Workflow')
    .select(['id', 'egcs_fo_workflowsetup']).where('egcs_fo_fundingopportunity', '=', opportunityId)
    .where('_deleted', '=', false).forUpdate().execute()
  const requested = new Set(requestedIds)
  const current = new Set(existing.map(row => String(row.egcs_fo_workflowsetup)))
  const removals = existing.filter(row => !requested.has(String(row.egcs_fo_workflowsetup))).map(row => String(row.id))
  if (removals.length) await db.updateTable('Funding_Opportunity_Workflow').set({ _deleted: true }).where('id', 'in', removals).execute()
  const additions = requestedIds.filter(id => !current.has(id))
  if (additions.length) await db.insertInto('Funding_Opportunity_Workflow').values(additions.map(id => ({
    egcs_fo_fundingopportunity: opportunityId, egcs_fo_workflowsetup: id
  }))).execute()
}
