import { sql, type Kysely, type Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { compareMoney } from '~~/shared/utils/money'
import { parseDatabaseMoney } from './database-money'

type Db = Kysely<Database> | Transaction<Database>

/** A Payment requires its current Commitment and affordable combined active totals across all years. */
export class AgreementCommitmentRevisionRequired extends Error {
  /** Retains a distinct domain error for localized Payment hold responses. */
  constructor() {
    super('Select a current Commitment and keep combined active Commitments within total Agreement program funding.')
    this.name = 'AgreementCommitmentRevisionRequired'
  }
}

/**
 * Reads current Commitment eligibility without treating historical versions as capacity.
 * @param db - Authorized snapshot or transaction holding the Agreement lock.
 * @param paymentId - Payment being completed, approved or processed.
 * @returns Whether the Payment needs a current, budget-valid Commitment.
 */
export const getAgreementPaymentCommitmentViolation = async (db: Db, paymentId: string): Promise<boolean> => {
  const result = (await sql<{ active: boolean, amount: string, budget: string }>`
    SELECT commitment.egcs_fc_active AND NOT commitment._deleted AS active,
      COALESCE((SELECT SUM(GREATEST(current_commitment.egcs_fc_totalamount,
        COALESCE((SELECT SUM(line.egcs_fc_amount)
          FROM "Funding_Case_Agreement_Commitment_Line" line
          WHERE line.egcs_fc_commitment = current_commitment.id AND NOT line._deleted), 0)))
        FROM "Funding_Case_Agreement_Commitment" current_commitment
        WHERE current_commitment.egcs_fc_fundingagreement = payment.egcs_fc_fundingagreement
          AND current_commitment.egcs_fc_currency = payment.egcs_fc_currency
          AND current_commitment.egcs_fc_active AND NOT current_commitment._deleted), 0)::text AS amount,
      COALESCE((SELECT SUM(line.egcs_fc_programfunding)
        FROM "Funding_Case_Agreement_Budget_Line_Item" line
        JOIN "Funding_Case_Agreement_Budget_Fiscal_Year" year
          ON year.id = line.egcs_fc_fundingagreementbudgetfiscalyear
          AND year.egcs_fc_fundingagreement = payment.egcs_fc_fundingagreement AND NOT year._deleted
        JOIN "Funding_Case_Agreement_Budget_Version" version
          ON version.id = year.egcs_fc_budgetversion
          AND version.egcs_fc_fundingagreement = payment.egcs_fc_fundingagreement
          AND version.egcs_fc_iscurrent AND NOT version._deleted
        WHERE line.egcs_fc_currency = payment.egcs_fc_currency AND NOT line._deleted), 0)::text AS budget
    FROM "Funding_Case_Agreement_Payment" payment
    JOIN "Funding_Case_Agreement_Commitment" commitment
      ON commitment.id = payment.egcs_fc_fundingagreementcommitment
      AND commitment.egcs_fc_fundingagreement = payment.egcs_fc_fundingagreement
      AND commitment.egcs_fc_currency = payment.egcs_fc_currency
    WHERE payment.id = ${paymentId}::bigint AND NOT payment._deleted
  `.execute(db)).rows[0]
  return Boolean(result && (!result.active || compareMoney(parseDatabaseMoney(result.amount), parseDatabaseMoney(result.budget)) > 0))
}

/**
 * Enforces Commitment eligibility inside the existing Agreement write lock.
 * @param db - Locked write transaction.
 * @param paymentId - Payment being completed, approved or processed.
 */
export const assertAgreementPaymentCommitmentCurrent = async (db: Db, paymentId: string): Promise<void> => {
  if (await getAgreementPaymentCommitmentViolation(db, paymentId)) throw new AgreementCommitmentRevisionRequired()
}
