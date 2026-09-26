/* eslint-disable jsdoc/require-param-description, jsdoc/require-returns, jsdoc/require-param -- internal setup reconciliation helpers */
import type { Kysely } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { sql } from 'kysely'
import { resolveAgreementStreamScopeContext } from './agreement'

/** All selected Streams must be available and owned by the same Program. */
export const resolveFundingOpportunityStreams = async (db: Kysely<Database>, streamIds: string[]) => {
  if (!streamIds.length || streamIds.length > 100 || new Set(streamIds).size !== streamIds.length) return null
  const first = await resolveAgreementStreamScopeContext(streamIds[0]!, db, { requireAvailable: true })
  if (!first) return null
  const streams = await db.selectFrom('Transfer_Payment_Stream')
    .select(['id', 'egcs_tp_transferpaymentprofile'])
    .where('id', 'in', streamIds).where('_deleted', '=', false).where('egcs_tp_active', '=', true).execute()
  return streams.length === streamIds.length
    && streams.every(stream => String(stream.egcs_tp_transferpaymentprofile) === first.profileId)
    ? first
    : null
}

/** Names may recur on disjoint Streams, but selected Streams cannot share a name. */
export const isFundingOpportunityNameAvailable = async (
  db: Kysely<Database>, programId: string, streamIds: string[], nameEn: string, nameFr: string, excludeId?: string
): Promise<boolean> => {
  await db.selectFrom('Transfer_Payment_Profile').select('id').where('id', '=', programId).forUpdate().executeTakeFirstOrThrow()
  let query = db.selectFrom('Funding_Opportunity_Profile')
    .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.id', 'Funding_Opportunity_Profile.egcs_fo_transferpaymentstream')
    .innerJoin('Funding_Opportunity_Stream', 'Funding_Opportunity_Stream.egcs_fo_fundingopportunity', 'Funding_Opportunity_Profile.id')
    .select('Funding_Opportunity_Profile.id')
    .where('Transfer_Payment_Stream.egcs_tp_transferpaymentprofile', '=', programId)
    .where('Funding_Opportunity_Profile._deleted', '=', false)
    .where('Funding_Opportunity_Stream._deleted', '=', false)
    .where('Funding_Opportunity_Stream.egcs_fo_transferpaymentstream', 'in', streamIds)
    .where(eb => eb.or([
      eb(sql<string>`lower(btrim(egcs_fo_name_en))`, '=', nameEn.trim().toLocaleLowerCase()),
      eb(sql<string>`lower(btrim(egcs_fo_name_fr))`, '=', nameFr.trim().toLocaleLowerCase())
    ]))
  if (excludeId) query = query.where('Funding_Opportunity_Profile.id', '!=', excludeId)
  return !await query.executeTakeFirst()
}

/**
 *
 * @param db
 * @param streamId
 * @param agencyId
 * @param reviewIds
 * @param workflowIds
 */
export const validateFundingOpportunityLinks = async (
  db: Kysely<Database>, streamIds: string[], agencyId: string,
  reviewIds: string[], workflowIds: string[]
): Promise<boolean> => {
  const [reviews, workflows] = await Promise.all([
    reviewIds.length
      ? db.selectFrom('Transfer_Payment_Stream_Review_Set')
          .innerJoin('Common_Review_Set_Setup', 'Common_Review_Set_Setup.id', 'Transfer_Payment_Stream_Review_Set.egcs_tp_reviewset')
          .select('Common_Review_Set_Setup.id')
          .where('Transfer_Payment_Stream_Review_Set.egcs_tp_transferpaymentstream', 'in', streamIds)
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
          .where('Transfer_Payment_Stream_Workflow.egcs_tp_transferpaymentstream', 'in', streamIds)
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

/** Reconciles the selected Stream links while retaining soft-deleted history. */
export const replaceFundingOpportunityStreams = async (
  db: Kysely<Database>, opportunityId: string, streamIds: string[]
): Promise<void> => {
  const existing = await db.selectFrom('Funding_Opportunity_Stream')
    .select(['id', 'egcs_fo_transferpaymentstream'])
    .where('egcs_fo_fundingopportunity', '=', opportunityId)
    .where('_deleted', '=', false).forUpdate().execute()
  const requested = new Set(streamIds)
  const current = new Set(existing.map(row => String(row.egcs_fo_transferpaymentstream)))
  const removals = existing.filter(row => !requested.has(String(row.egcs_fo_transferpaymentstream))).map(row => String(row.id))
  if (removals.length) await db.updateTable('Funding_Opportunity_Stream').set({ _deleted: true }).where('id', 'in', removals).execute()
  const additions = streamIds.filter(id => !current.has(id))
  if (additions.length) await db.insertInto('Funding_Opportunity_Stream').values(additions.map(id => ({
    egcs_fo_fundingopportunity: opportunityId, egcs_fo_transferpaymentstream: id
  }))).execute()
}

/** Active Streams for an Opportunity, ordered with the anchor first. */
export const listFundingOpportunityStreamIds = async (db: Kysely<Database>, opportunityId: string): Promise<string[]> => {
  const [opportunity, rows] = await Promise.all([
    db.selectFrom('Funding_Opportunity_Profile').select('egcs_fo_transferpaymentstream').where('id', '=', opportunityId).executeTakeFirstOrThrow(),
    db.selectFrom('Funding_Opportunity_Stream').select('egcs_fo_transferpaymentstream')
      .where('egcs_fo_fundingopportunity', '=', opportunityId).where('_deleted', '=', false).execute()
  ])
  const anchor = String(opportunity.egcs_fo_transferpaymentstream)
  return rows.map(row => String(row.egcs_fo_transferpaymentstream))
    .sort((a, b) => a === anchor ? -1 : b === anchor ? 1 : a.localeCompare(b, undefined, { numeric: true }))
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
