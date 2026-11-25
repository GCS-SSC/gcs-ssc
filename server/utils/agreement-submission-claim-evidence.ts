import type { Kysely } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { ClaimSubmissionReferenceSnapshot } from '~~/shared/types/agreement-submission-database'
import { claimCustomFieldSnapshot } from '~~/shared/utils/claim-custom-field-snapshot'
import { PersistedClaimCustomFieldDefinitionsSchema, type AssignedAgencyCustomFieldDefinition } from '~~/shared/types/schemas/agreement-custom-fields'

/**
 * Captures the submission event's business labels and the Claim's pinned fields.
 * @param db - The event-writing transaction.
 * @param claimId - Claim linked to the submission.
 * @param parseDefinitions - Stored definition parser, with optional request-localized errors.
 * @param sourceReferences - References from the received payload when it differs from the staff-edited Claim.
 * @param sourceReferences.applicantRecipientId - Proponent ID in the received payload.
 * @param sourceReferences.fiscalYearId - Stable Agreement budget fiscal-year ID in the received payload.
 * @returns Display evidence for the event.
 */
export const readClaimSubmissionEvidence = async (
  db: Kysely<Database>,
  claimId: string,
  parseDefinitions: (stored: unknown) => AssignedAgencyCustomFieldDefinition[] | Promise<AssignedAgencyCustomFieldDefinition[]> =
    stored => PersistedClaimCustomFieldDefinitionsSchema.parse(stored),
  sourceReferences?: { applicantRecipientId: string; fiscalYearId: string }
) => {
  const claim = await db.selectFrom('Funding_Case_Agreement_Claim as claim')
    .innerJoin('Applicant_Recipient_Profile as recipient', join => sourceReferences
      ? join.on('recipient.id', '=', sourceReferences.applicantRecipientId)
      : join.onRef('recipient.id', '=', 'claim.egcs_fc_applicantrecipient'))
    .innerJoin('Funding_Case_Agreement_Budget_Fiscal_Year as budgetYear', join => sourceReferences
      ? join.on('budgetYear.id', '=', sourceReferences.fiscalYearId)
      : join.onRef('budgetYear.id', '=', 'claim.egcs_fc_fiscalyear'))
    .innerJoin('Agency_Fiscal_Year as fiscalYear', 'fiscalYear.id', 'budgetYear.egcs_fc_fiscalyear')
    .select([
      'claim.egcs_fc_customfielddefinitions', 'claim.egcs_fc_customfields',
      'recipient.egcs_ar_legalname_en', 'recipient.egcs_ar_legalname_fr',
      'recipient.egcs_ar_operatingname_en', 'recipient.egcs_ar_operatingname_fr',
      'fiscalYear.egcs_ay_fiscalyeardisplay'
    ])
    .where('claim.id', '=', claimId).where('claim._deleted', '=', false).executeTakeFirstOrThrow()
  const references: ClaimSubmissionReferenceSnapshot = {
    applicantRecipientId: {
      en: claim.egcs_ar_legalname_en || claim.egcs_ar_operatingname_en || null,
      fr: claim.egcs_ar_legalname_fr || claim.egcs_ar_operatingname_fr || null
    },
    fiscalYearId: claim.egcs_ay_fiscalyeardisplay
  }
  const definitions = await parseDefinitions(claim.egcs_fc_customfielddefinitions)
  return { references, fields: claimCustomFieldSnapshot(definitions, claim.egcs_fc_customfields) }
}
