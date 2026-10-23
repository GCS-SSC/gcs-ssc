import type { H3Event } from 'h3'
import { sql, type Kysely, type Transaction } from 'kysely'
import { ZodError } from 'zod'
import type { Database } from '~~/shared/types/database'
import { validationError } from './api-errors'

/**
 * Resolves a budget line's existing Agreement Proponent under its aggregate write lock.
 * @param event - Authorized request.
 * @param trx - Owning Agreement write transaction.
 * @param input - Proposed and retained Proponent identity.
 * @param input.agreementId - Owning Agreement.
 * @param input.proponentId - Explicitly proposed profile ID.
 * @param input.savedProponentId - Retained profile ID for omitted PATCH input.
 * @returns Validated linked profile ID, defaulting a sole relationship on create.
 */
export const resolveAgreementBudgetProponent = async (
  event: H3Event,
  trx: Transaction<Database>,
  input: { agreementId: string, proponentId?: string, savedProponentId?: string }
): Promise<string> => {
  const proponents = await trx.selectFrom('Funding_Case_Agreement_Applicant_Recipient')
    .select(sql<string>`egcs_fc_applicantrecipient::text`.as('egcs_fc_applicantrecipient'))
    .where('egcs_fc_fundingagreement', '=', input.agreementId)
    .where('_deleted', '=', false)
    .forShare()
    .execute()
  const selectedId = input.proponentId ?? input.savedProponentId
  const [soleProponent] = proponents
  const resolvedId = selectedId ?? (proponents.length === 1 ? soleProponent?.egcs_fc_applicantrecipient : undefined)
  if (resolvedId && proponents.some(proponent => proponent.egcs_fc_applicantrecipient === resolvedId)) return resolvedId
  return await validationError(event, new ZodError([{
    code: 'custom', path: ['egcs_fc_applicantrecipient'],
    message: selectedId ? 'validation.invalid_selection' : 'validation.required'
  }]))
}

/**
 * Returns complete local choices for the Agreement's existing Proponent relationships.
 * @param db - Authorized snapshot or transaction.
 * @param agreementId - Owning Agreement.
 * @returns Profile IDs and bilingual labels for every active relationship.
 */
export const loadAgreementBudgetProponents = async (db: Kysely<Database> | Transaction<Database>, agreementId: string) => await db
  .selectFrom('Funding_Case_Agreement_Applicant_Recipient as relationship')
  .innerJoin('Applicant_Recipient_Profile as proponent', 'proponent.id', 'relationship.egcs_fc_applicantrecipient')
  .select([sql<string>`proponent.id::text`.as('id'),
    sql<string>`COALESCE(proponent.egcs_ar_legalname_en, proponent.egcs_ar_operatingname_en, proponent.id::text)`.as('label_en'),
    sql<string>`COALESCE(proponent.egcs_ar_legalname_fr, proponent.egcs_ar_operatingname_fr, proponent.id::text)`.as('label_fr')])
  .where('relationship.egcs_fc_fundingagreement', '=', agreementId)
  .where('relationship._deleted', '=', false)
  .orderBy('proponent.id').execute()

/**
 * Loads retained bilingual labels for a persisted budget response.
 * @param db - Owning snapshot or transaction.
 * @param proponentId - Linked profile ID.
 * @returns Saved profile's bilingual labels.
 */
export const loadAgreementBudgetProponentName = async (db: Kysely<Database> | Transaction<Database>, proponentId: string) => await db
  .selectFrom('Applicant_Recipient_Profile')
  .select([
    sql<string>`COALESCE(egcs_ar_legalname_en, egcs_ar_operatingname_en, id::text)`.as('applicant_recipient_name_en'),
    sql<string>`COALESCE(egcs_ar_legalname_fr, egcs_ar_operatingname_fr, id::text)`.as('applicant_recipient_name_fr')])
  .where('id', '=', proponentId).executeTakeFirstOrThrow()
