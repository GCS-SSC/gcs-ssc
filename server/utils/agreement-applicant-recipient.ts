import { sql, type RawBuilder, type Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'

/**
 * Projects reference eligibility for an Agreement-Proponent row. It does not grant
 * delete authority: the write route still checks Manager, assignment and lifecycle.
 *
 * @returns SQL Boolean projection for the unaliased Agreement-Proponent table.
 */
export const agreementApplicantRecipientCanDelete = (): RawBuilder<boolean> => sql<boolean>`
  NOT EXISTS (
    SELECT 1 FROM "Funding_Case_Agreement_Responsible_Party_Activity" AS responsible_party
    INNER JOIN "Funding_Case_Agreement_Activity" AS activity
      ON activity.id = responsible_party.egcs_fc_activity
    WHERE responsible_party.egcs_fc_responsibleparty = "Funding_Case_Agreement_Applicant_Recipient".id
      AND NOT responsible_party._deleted AND NOT activity._deleted
      AND activity.egcs_fc_fundingagreement = "Funding_Case_Agreement_Applicant_Recipient".egcs_fc_fundingagreement
  )
  AND NOT EXISTS (
    SELECT 1 FROM "Funding_Case_Agreement_Claim" AS claim
    WHERE claim.egcs_fc_fundingagreement = "Funding_Case_Agreement_Applicant_Recipient".egcs_fc_fundingagreement
      AND claim.egcs_fc_applicantrecipient = "Funding_Case_Agreement_Applicant_Recipient".egcs_fc_applicantrecipient
      AND NOT claim._deleted
  )
  AND NOT EXISTS (
    SELECT 1 FROM "Funding_Case_Agreement_Payment" AS payment
    WHERE payment.egcs_fc_fundingagreement = "Funding_Case_Agreement_Applicant_Recipient".egcs_fc_fundingagreement
      AND payment.egcs_fc_applicantrecipient = "Funding_Case_Agreement_Applicant_Recipient".egcs_fc_applicantrecipient
      AND NOT payment._deleted
  )
  AND NOT EXISTS (
    SELECT 1 FROM "Funding_Case_Agreement_Account_Receivable" AS receivable
    WHERE receivable.egcs_fc_fundingagreement = "Funding_Case_Agreement_Applicant_Recipient".egcs_fc_fundingagreement
      AND receivable.egcs_fc_applicantrecipient = "Funding_Case_Agreement_Applicant_Recipient".egcs_fc_applicantrecipient
      AND NOT receivable._deleted
  )
`

/**
 * Checks the same reference policy as the list projection under the owning
 * Agreement write lock. Relationship replacement and deletion both preserve
 * existing Agreement evidence; type-only edits retain the relationship identity.
 *
 * @param trx Active transaction holding the owning Agreement write lock.
 * @param agreementId Owning Agreement ID.
 * @param relationshipId Agreement-Proponent relationship ID.
 * @returns Whether any active Agreement item still references this Proponent.
 */
export const isAgreementApplicantRecipientInUse = async (
  trx: Transaction<Database>,
  agreementId: string,
  relationshipId: string
): Promise<boolean> => {
  const relationship = await trx
    .selectFrom('Funding_Case_Agreement_Applicant_Recipient')
    .select(agreementApplicantRecipientCanDelete().as('can_delete'))
    .where('id', '=', relationshipId)
    .where('egcs_fc_fundingagreement', '=', agreementId)
    .where('_deleted', '=', false)
    .forUpdate()
    .executeTakeFirst()
  return relationship ? !relationship.can_delete : false
}
