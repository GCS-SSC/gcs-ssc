/* eslint-disable jsdoc/require-returns, jsdoc/require-param-description -- scope helpers are used only by the guarded routes */
import type { Kysely } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { Scope } from '~~/shared/utils/scopes'

export interface FundingOpportunityScope {
  agencyId: string
  transferPaymentId: string
  streamId: string
  streamIds: string[]
  opportunityId: string
  scope: Scope
}

/**
 * Resolves the immutable authorization chain of an active opportunity.
 * @param db
 * @param opportunityId
 */
export const resolveFundingOpportunityScope = async (
  db: Kysely<Database>, opportunityId: string
): Promise<FundingOpportunityScope | null> => {
  const row = await db.selectFrom('Funding_Opportunity_Profile')
    .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.id', 'Funding_Opportunity_Profile.egcs_fo_transferpaymentstream')
    .innerJoin('Transfer_Payment_Profile', 'Transfer_Payment_Profile.id', 'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile')
    .innerJoin('Agency_Profile', 'Agency_Profile.id', 'Transfer_Payment_Profile.egcs_tp_agency')
    .select([
      'Funding_Opportunity_Profile.id as opportunity_id',
      'Transfer_Payment_Stream.id as stream_id',
      'Transfer_Payment_Profile.id as transfer_payment_id',
      'Agency_Profile.id as agency_id'
    ])
    .where('Funding_Opportunity_Profile.id', '=', opportunityId)
    .where('Funding_Opportunity_Profile._deleted', '=', false)
    .where('Transfer_Payment_Stream._deleted', '=', false)
    .where('Transfer_Payment_Profile._deleted', '=', false)
    .where('Agency_Profile._deleted', '=', false)
    .executeTakeFirst()
  if (!row) return null
  const agencyId = String(row.agency_id)
  const transferPaymentId = String(row.transfer_payment_id)
  const streamId = String(row.stream_id)
  const streamIds = (await db.selectFrom('Funding_Opportunity_Stream')
    .select('egcs_fo_transferpaymentstream')
    .where('egcs_fo_fundingopportunity', '=', opportunityId)
    .where('_deleted', '=', false).execute()).map(link => String(link.egcs_fo_transferpaymentstream))
  if (!streamIds.includes(streamId)) return null
  return {
    agencyId, transferPaymentId, streamId, streamIds, opportunityId: String(row.opportunity_id),
    scope: {
      type: 'entity', agencyId,
      path: [{ type: 'transfer_payment', id: transferPaymentId }]
    }
  }
}

/**
 *
 * @param db
 * @param intakeId
 */
export const resolveFundingCaseScope = async (db: Kysely<Database>, intakeId: string) => {
  const intake = await db.selectFrom('Funding_Case_Intake_Profile')
    .select(['egcs_fi_fundingopportunity', 'egcs_fi_status'])
    .where('id', '=', intakeId).where('_deleted', '=', false).executeTakeFirst()
  if (!intake) return null
  const opportunity = await resolveFundingOpportunityScope(db, String(intake.egcs_fi_fundingopportunity))
  return opportunity ? { ...opportunity, intakeId, statusId: String(intake.egcs_fi_status) } : null
}
