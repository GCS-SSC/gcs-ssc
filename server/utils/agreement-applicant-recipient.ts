import type { Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'

/**
 * Returns whether an active Activity still references an Agreement-Proponent relationship.
 *
 * @param trx Active Agreement write transaction.
 * @param agreementId Owning Agreement ID.
 * @param relationshipId Agreement-Proponent relationship ID.
 * @returns Whether changing or deleting the relationship would alter Activity evidence.
 */
export const isAgreementApplicantRecipientInUse = async (
  trx: Transaction<Database>,
  agreementId: string,
  relationshipId: string
): Promise<boolean> => Boolean(await trx
  .selectFrom('Funding_Case_Agreement_Responsible_Party_Activity')
  .innerJoin(
    'Funding_Case_Agreement_Activity',
    'Funding_Case_Agreement_Activity.id',
    'Funding_Case_Agreement_Responsible_Party_Activity.egcs_fc_activity'
  )
  .select('Funding_Case_Agreement_Responsible_Party_Activity.id')
  .where('Funding_Case_Agreement_Responsible_Party_Activity.egcs_fc_responsibleparty', '=', relationshipId)
  .where('Funding_Case_Agreement_Responsible_Party_Activity._deleted', '=', false)
  .where('Funding_Case_Agreement_Activity.egcs_fc_fundingagreement', '=', agreementId)
  .where('Funding_Case_Agreement_Activity._deleted', '=', false)
  .forUpdate(['Funding_Case_Agreement_Responsible_Party_Activity', 'Funding_Case_Agreement_Activity'])
  .executeTakeFirst())
