import type { Transaction } from 'kysely'
import type { Database, Entity_Type } from '~~/shared/types/database'
import { transitionBusinessStatus } from '~~/server/utils/business-status-runtime'

/**
 * Applies domain effects only after Completion reaches a positive terminus.
 * @param trx - Open transaction holding the completed entity locks.
 * @param entityType - Exact completed entity type.
 * @param entityId - Exact completed entity identifier.
 */
export const applyCompletionPositiveTerminusEffects = async (
  trx: Transaction<Database>,
  entityType: Entity_Type,
  entityId: string
): Promise<void> => {
  if (entityType === 'fundingclaimreconcile') {
    const reconcile = await trx.selectFrom('Funding_Case_Agreement_Claim_Reconcile')
      .innerJoin('Funding_Case_Agreement_Claim', 'Funding_Case_Agreement_Claim.id', 'Funding_Case_Agreement_Claim_Reconcile.egcs_fc_fundingagreementclaim')
      .innerJoin('Funding_Case_Agreement_Profile', 'Funding_Case_Agreement_Profile.id', 'Funding_Case_Agreement_Claim.egcs_fc_fundingagreement')
      .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.id', 'Funding_Case_Agreement_Profile.egcs_fc_transferpaymentstream')
      .innerJoin('Transfer_Payment_Profile', 'Transfer_Payment_Profile.id', 'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile')
      .select([
        'Funding_Case_Agreement_Claim_Reconcile.egcs_fc_isfinal as is_final',
        'Funding_Case_Agreement_Claim.id as claim_id',
        'Transfer_Payment_Profile.egcs_tp_agency as agency_id'
      ])
      .where('Funding_Case_Agreement_Claim_Reconcile.id', '=', entityId)
      .where('Funding_Case_Agreement_Claim_Reconcile._deleted', '=', false)
      .where('Funding_Case_Agreement_Claim._deleted', '=', false)
      .where('Funding_Case_Agreement_Profile._deleted', '=', false)
      .where('Transfer_Payment_Stream._deleted', '=', false)
      .where('Transfer_Payment_Profile._deleted', '=', false)
      .forUpdate('Funding_Case_Agreement_Claim_Reconcile')
      .executeTakeFirstOrThrow()
    await trx.updateTable('Funding_Case_Agreement_Claim_Reconcile')
      .set({ egcs_fc_isopen: false })
      .where('id', '=', entityId)
      .where('_deleted', '=', false)
      .executeTakeFirstOrThrow()
    if (!reconcile.is_final) return
    const agencyConfiguration = await trx.selectFrom('Agency_Profile')
      .select('egcs_ay_claimreconciliationfinalstatus')
      .where('id', '=', String(reconcile.agency_id))
      .where('_deleted', '=', false)
      .executeTakeFirst()
    if (agencyConfiguration?.egcs_ay_claimreconciliationfinalstatus) {
      await transitionBusinessStatus(
        trx,
        'fundingcaseagreementclaim',
        String(reconcile.claim_id),
        agencyConfiguration.egcs_ay_claimreconciliationfinalstatus
      )
    }
    return
  }

  if (entityType === 'fundingcaseforecast') {
    const forecast = await trx.selectFrom('Funding_Case_Agreement_Forecast')
      .select(['egcs_fc_fundingagreement', 'egcs_fc_fiscalyear'])
      .where('id', '=', entityId)
      .where('_deleted', '=', false)
      .forUpdate()
      .executeTakeFirstOrThrow()
    await trx.selectFrom('Funding_Case_Agreement_Forecast')
      .select('id')
      .where('egcs_fc_fundingagreement', '=', String(forecast.egcs_fc_fundingagreement))
      .where('egcs_fc_fiscalyear', '=', forecast.egcs_fc_fiscalyear)
      .where('egcs_fc_active', '=', true)
      .where('_deleted', '=', false)
      .orderBy('id', 'asc')
      .forUpdate()
      .execute()
    await trx.updateTable('Funding_Case_Agreement_Forecast')
      .set({ egcs_fc_active: false })
      .where('egcs_fc_fundingagreement', '=', String(forecast.egcs_fc_fundingagreement))
      .where('egcs_fc_fiscalyear', '=', forecast.egcs_fc_fiscalyear)
      .where('id', '!=', entityId)
      .where('egcs_fc_active', '=', true)
      .where('_deleted', '=', false)
      .execute()
    await trx.updateTable('Funding_Case_Agreement_Forecast')
      .set({ egcs_fc_active: true })
      .where('id', '=', entityId)
      .where('_deleted', '=', false)
      .executeTakeFirstOrThrow()
    return
  }

  if (entityType !== 'fundingcaseagreementcommitment') return

  const commitment = await trx.selectFrom('Funding_Case_Agreement_Commitment')
    .select(['egcs_fc_fundingagreement', 'egcs_fc_type'])
    .where('id', '=', entityId)
    .where('_deleted', '=', false)
    .forUpdate()
    .executeTakeFirstOrThrow()
  await trx.selectFrom('Funding_Case_Agreement_Commitment')
    .select('id')
    .where('egcs_fc_fundingagreement', '=', String(commitment.egcs_fc_fundingagreement))
    .where('egcs_fc_type', '=', commitment.egcs_fc_type)
    .where('egcs_fc_active', '=', true)
    .where('_deleted', '=', false)
    .orderBy('id', 'asc')
    .forUpdate()
    .execute()
  await trx.updateTable('Funding_Case_Agreement_Commitment')
    .set({ egcs_fc_active: false })
    .where('egcs_fc_fundingagreement', '=', String(commitment.egcs_fc_fundingagreement))
    .where('egcs_fc_type', '=', commitment.egcs_fc_type)
    .where('id', '!=', entityId)
    .where('egcs_fc_active', '=', true)
    .where('_deleted', '=', false)
    .execute()
  await trx.updateTable('Funding_Case_Agreement_Commitment')
    .set({ egcs_fc_active: true })
    .where('id', '=', entityId)
    .where('_deleted', '=', false)
    .executeTakeFirstOrThrow()
}
