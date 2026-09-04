/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns -- Internal target resolvers use explicit names and narrow return types. */
import type { Kysely } from 'kysely'
import type { ExactEntityTarget } from '@gcs-ssc/authorization'
import type { AssignableEntityType, Database } from '~~/shared/types/database'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

type AssignmentTarget = ExactEntityTarget<AssignableEntityType>

/** Resolves the canonical Agreement owning an exact assignment target. */
export const resolveAssignmentTargetAgreementId = async (
  db: Kysely<Database>,
  target: AssignmentTarget,
  options: { lockIdentity?: boolean } = {}
): Promise<string | null> => {
  if (!isPositivePostgresBigintText(target.entityId)) return null
  if (options.lockIdentity === true) {
    const identity = await db.selectFrom('Common_Entity')
      .select('id')
      .where('id', '=', target.entityId)
      .where('egcs_cn_entitytype', '=', target.entityType)
      .where('_deleted', '=', false)
      .forUpdate()
      .executeTakeFirst()
    if (!identity) return null
  }

  if (target.entityType === 'fundingcaseagreement') {
    const agreement = await db.selectFrom('Funding_Case_Agreement_Profile')
      .select('id')
      .where('id', '=', target.entityId)
      .where('_deleted', '=', false)
      .executeTakeFirst()
    return agreement ? String(agreement.id) : null
  }

  if (target.entityType === 'fundingcaseagreementclaim') {
    const claim = await db.selectFrom('Funding_Case_Agreement_Claim')
      .select('egcs_fc_fundingagreement')
      .where('id', '=', target.entityId)
      .where('_deleted', '=', false)
      .executeTakeFirst()
    return claim ? String(claim.egcs_fc_fundingagreement) : null
  }

  if (target.entityType === 'fundingcaseagreementcloseout') {
    const closeout = await db.selectFrom('Funding_Case_Agreement_Closeout')
      .select('egcs_fc_fundingagreement')
      .where('id', '=', target.entityId)
      .where('_deleted', '=', false)
      .executeTakeFirst()
    return closeout ? String(closeout.egcs_fc_fundingagreement) : null
  }

  if (target.entityType === 'fundingclaimreconcile') {
    const reconciliation = await db.selectFrom('Funding_Case_Agreement_Claim_Reconcile')
      .innerJoin('Funding_Case_Agreement_Claim', 'Funding_Case_Agreement_Claim.id', 'Funding_Case_Agreement_Claim_Reconcile.egcs_fc_fundingagreementclaim')
      .select('Funding_Case_Agreement_Claim.egcs_fc_fundingagreement')
      .where('Funding_Case_Agreement_Claim_Reconcile.id', '=', target.entityId)
      .where('Funding_Case_Agreement_Claim_Reconcile._deleted', '=', false)
      .where('Funding_Case_Agreement_Claim._deleted', '=', false)
      .executeTakeFirst()
    return reconciliation ? String(reconciliation.egcs_fc_fundingagreement) : null
  }

  if (target.entityType === 'fundingcasepayment') {
    const payment = await db.selectFrom('Funding_Case_Agreement_Payment').select('egcs_fc_fundingagreement')
      .where('id', '=', target.entityId).where('_deleted', '=', false).executeTakeFirst()
    return payment ? String(payment.egcs_fc_fundingagreement) : null
  }

  if (target.entityType === 'fundingcaseforecast') {
    const forecast = await db.selectFrom('Funding_Case_Agreement_Forecast').select('egcs_fc_fundingagreement')
      .where('id', '=', target.entityId).where('_deleted', '=', false).executeTakeFirst()
    return forecast ? String(forecast.egcs_fc_fundingagreement) : null
  }

  if (target.entityType === 'fundingcasemonitor') {
    const monitor = await db.selectFrom('Funding_Case_Agreement_Monitor').select('egcs_fc_fundingagreement')
      .where('id', '=', target.entityId).where('_deleted', '=', false).executeTakeFirst()
    return monitor ? String(monitor.egcs_fc_fundingagreement) : null
  }

  if (target.entityType === 'fundingcaseamendment') {
    const amendment = await db.selectFrom('Funding_Case_Agreement_Amendment').select('egcs_fc_fundingagreement')
      .where('id', '=', target.entityId).where('_deleted', '=', false).executeTakeFirst()
    return amendment ? String(amendment.egcs_fc_fundingagreement) : null
  }

  if (target.entityType === 'fundingcaseagreementcommitment') {
    const commitment = await db.selectFrom('Funding_Case_Agreement_Commitment').select('egcs_fc_fundingagreement')
      .where('id', '=', target.entityId).where('_deleted', '=', false).executeTakeFirst()
    return commitment ? String(commitment.egcs_fc_fundingagreement) : null
  }

  return null
}

export const resolveClaimLineAssignmentTarget = async (
  db: Kysely<Database>,
  lineId: string
): Promise<AssignmentTarget | null> => {
  if (!isPositivePostgresBigintText(lineId)) return null
  const line = await db.selectFrom('Funding_Case_Agreement_Claim_Line_Item')
    .select('egcs_fc_fundingagreementclaim')
    .where('id', '=', lineId)
    .where('_deleted', '=', false)
    .executeTakeFirst()
  if (!line) return null
  return { entityType: 'fundingcaseagreementclaim', entityId: String(line.egcs_fc_fundingagreementclaim) }
}

export const resolveClaimReconcileLineAssignmentTarget = async (
  db: Kysely<Database>,
  lineId: string
): Promise<AssignmentTarget | null> => {
  if (!isPositivePostgresBigintText(lineId)) return null
  const line = await db.selectFrom('Funding_Case_Agreement_Claim_Reconcile_Line_Item')
    .select('egcs_fc_fundingagreementclaimreconcile')
    .where('id', '=', lineId)
    .where('_deleted', '=', false)
    .executeTakeFirst()
  if (!line) return null
  return { entityType: 'fundingclaimreconcile', entityId: String(line.egcs_fc_fundingagreementclaimreconcile) }
}

export const resolveCommitmentLineAssignmentTarget = async (
  db: Kysely<Database>,
  lineId: string
): Promise<AssignmentTarget | null> => {
  if (!isPositivePostgresBigintText(lineId)) return null
  const line = await db.selectFrom('Funding_Case_Agreement_Commitment_Line')
    .select('egcs_fc_commitment')
    .where('id', '=', lineId)
    .where('_deleted', '=', false)
    .executeTakeFirst()
  if (!line) return null
  return { entityType: 'fundingcaseagreementcommitment', entityId: String(line.egcs_fc_commitment) }
}

export const resolveForecastLineAssignmentTarget = async (
  db: Kysely<Database>,
  lineId: string
): Promise<AssignmentTarget | null> => {
  if (!isPositivePostgresBigintText(lineId)) return null
  const line = await db.selectFrom('Funding_Case_Agreement_Forecast_Line_Item')
    .select('egcs_fc_agreementforecast')
    .where('id', '=', lineId)
    .where('_deleted', '=', false)
    .executeTakeFirst()
  if (!line) return null
  return { entityType: 'fundingcaseforecast', entityId: String(line.egcs_fc_agreementforecast) }
}

export const resolvePaymentLineAssignmentTarget = async (
  db: Kysely<Database>,
  lineId: string
): Promise<AssignmentTarget | null> => {
  if (!isPositivePostgresBigintText(lineId)) return null
  const line = await db.selectFrom('Funding_Case_Agreement_Payment_Line')
    .select('egcs_fc_fundingagreementpayment')
    .where('id', '=', lineId)
    .where('_deleted', '=', false)
    .executeTakeFirst()
  if (!line) return null
  return { entityType: 'fundingcasepayment', entityId: String(line.egcs_fc_fundingagreementpayment) }
}
