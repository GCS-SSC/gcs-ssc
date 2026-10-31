import type { H3Event } from 'h3'
import type { Kysely, Transaction } from 'kysely'
import type { Currency_Codes, Database } from '~~/shared/types/database'
import { badRequest, notFound } from './api-errors'
import { parseMoney, type Money } from '~~/shared/utils/money'

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

/**
 * Rejects money denominated outside the freshly resolved financial owner.
 * @param event - Authorized request used for localized validation.
 * @param currency - Immutable denomination read inside the owning transaction.
 * @param values - Validated request amounts, including inherited child fields.
 */
export const assertCurrencyMoneyValues = async (
  event: H3Event, currency: string, values: Iterable<Money>
): Promise<void> => {
  try {
    for (const value of values) {
      if (parseMoney(value).currency !== currency.toUpperCase()) throw new TypeError('Money currency does not match its owner')
    }
  } catch {
    await badRequest(event, 'INVALID_CURRENCY_AMOUNT', 'validation.invalid_number')
  }
}
