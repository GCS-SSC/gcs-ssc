/* eslint-disable jsdoc/require-jsdoc -- Claim attribution is checked against the active Agreement relationship. */
import type { Kysely } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export const isAgreementClaimProponentAvailable = async (db: Kysely<Database>, agreementId: string, proponentId: string) => {
  if (!isPositivePostgresBigintText(proponentId)) return false
  const link = await db.selectFrom('Funding_Case_Agreement_Applicant_Recipient as link')
    .innerJoin('Applicant_Recipient_Profile as profile', 'profile.id', 'link.egcs_fc_applicantrecipient')
    .select('profile.id').where('link.egcs_fc_fundingagreement', '=', agreementId)
    .where('link.egcs_fc_applicantrecipient', '=', proponentId).where('link._deleted', '=', false)
    .where('profile._deleted', '=', false).where('profile.egcs_ar_active', '=', true)
    .forShare('link').forShare('profile').executeTakeFirst()
  return Boolean(link)
}
