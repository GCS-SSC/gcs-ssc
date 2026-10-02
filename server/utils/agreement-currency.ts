import type { H3Event } from 'h3'
import type { Kysely, Transaction } from 'kysely'
import type { Currency_Codes, Database } from '~~/shared/types/database'
import { badRequest, notFound } from './api-errors'

/**
 * Reads the immutable denomination of the owning live Agreement.
 * @param db - Caller-owned authorized snapshot or locked transaction.
 * @param agreementId - Owning Agreement identifier.
 * @returns The native denomination, or null when the Agreement is unavailable.
 */
export const resolveAgreementCurrency = async (
  db: Kysely<Database> | Transaction<Database>, agreementId: string
): Promise<Currency_Codes | null> => {
  const agreement = await db.selectFrom('Funding_Case_Agreement_Profile')
    .select('egcs_fc_currency').where('id', '=', agreementId).where('_deleted', '=', false).executeTakeFirst()
  return agreement?.egcs_fc_currency ?? null
}

/**
 * Validates a financial selection against its owning Agreement denomination.
 * @param event - Fresh authorized request.
 * @param db - Caller-owned authorized snapshot or locked transaction.
 * @param agreementId - Owning Agreement identifier.
 * @param requestedCurrency - Requested native denomination.
 * @returns The owning denomination after validation.
 */
export const assertAgreementCurrency = async (
  event: H3Event, db: Kysely<Database> | Transaction<Database>, agreementId: string, requestedCurrency?: string
): Promise<Currency_Codes> => {
  const currency = await resolveAgreementCurrency(db, agreementId)
  if (!currency) return await notFound(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  if (requestedCurrency !== undefined && currency !== requestedCurrency) return await badRequest(event, 'AGREEMENT_CURRENCY_MISMATCH', 'apiErrors.agreement.currency_mismatch')
  return currency
}
