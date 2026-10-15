import { sql, type Kysely } from 'kysely'
import type { Currency_Codes, Database } from '~~/shared/types/database'
import { compareMoney, parseMoneyText, subtractMoney } from '~~/shared/utils/money'
import { parseDatabaseMoney } from './database-money'
import { hasAccountingTable } from './correction-schema'

const ZERO = parseMoneyText('0.00')

/**
 * Adds actual Claim AR receipts to budget-reduction credit without counting applied plans twice.
 * Payment inputs and ordinary Claim/reconciliation capacity retain their separate plan-based rules.
 * @param db - Snapshot holding the Agreement write lock when validating a budget change.
 * @param agreementId - Agreement whose retained Claim sources supply the credit.
 * @param currency - Owning Agreement currency.
 * @returns Additional negative usage adjustments, attributed to each original Claim and stable year.
 */
export const readAgreementBudgetRecoveryCredits = async (
  db: Kysely<Database>, agreementId: string, currency: Currency_Codes
) => {
  if (!await hasAccountingTable(db, 'Funding_Case_Account_Receivable_Credit_Memo_Line')) return []
  const offsets = await hasAccountingTable(db, 'Funding_Case_Account_Receivable_Offset_Memo')
    ? sql`COALESCE((SELECT SUM(application.egcs_fc_amount)
        FROM "Funding_Case_Account_Receivable_Offset_Memo" memo
        JOIN "Funding_Case_Account_Receivable_Offset_Memo_Application" application ON application.egcs_fc_offsetmemo=memo.id
        JOIN "Funding_Case_Account_Receivable_Recovery" recovery ON recovery.id=application.egcs_fc_recovery
        JOIN "Funding_Case_Account_Receivable_Pool" pool ON pool.id=memo.egcs_fc_pool
        WHERE memo.egcs_fc_receivable=source."receivableId"::bigint
          AND pool.egcs_fc_currency=${currency} AND recovery.egcs_fc_outcome='posted'
          AND NOT memo._deleted AND NOT application._deleted AND NOT recovery._deleted),0)`
    : sql`0`
  const rows = (await sql<{ claimId: string; fiscalYearId: string; recovered: string; applied: string }>`
    WITH source AS (
      SELECT debt.id::text AS "receivableId", MIN(claim.id)::text AS "claimId",
        MIN(COALESCE(year.egcs_fc_originalbudgetfiscalyear,year.id))::text AS "fiscalYearId"
      FROM "Funding_Case_Agreement_Account_Receivable" debt
      JOIN "Funding_Case_Agreement_Account_Receivable_Line" retained ON retained.egcs_fc_receivable=debt.id
        AND retained.egcs_fc_fundingagreement=debt.egcs_fc_fundingagreement AND NOT retained._deleted
      JOIN "Funding_Case_Agreement_Claim" claim ON claim.id=retained.egcs_fc_claim
        AND claim.egcs_fc_fundingagreement=debt.egcs_fc_fundingagreement AND NOT claim._deleted
      JOIN "Funding_Case_Agreement_Claim_Line_Item" line ON line.id=retained.egcs_fc_claimline
        AND line.egcs_fc_fundingagreementclaim=claim.id AND line.egcs_fc_currency=${currency} AND NOT line._deleted
      JOIN "Funding_Case_Agreement_Budget_Fiscal_Year" year ON year.id=claim.egcs_fc_fiscalyear
        AND year.egcs_fc_fundingagreement=debt.egcs_fc_fundingagreement
      WHERE debt.egcs_fc_fundingagreement=${agreementId}::bigint AND debt.egcs_fc_currency=${currency}
        AND debt.egcs_fc_claimrelated AND debt.egcs_fc_linkedreceivable IS NULL
        AND debt.egcs_fc_outcome='posted' AND NOT debt._deleted
      GROUP BY debt.id HAVING COUNT(DISTINCT claim.id)=1
    )
    SELECT source."claimId",source."fiscalYearId",
      (COALESCE((SELECT SUM(line.egcs_fc_amount)
        FROM "Funding_Case_Account_Receivable_Credit_Memo_Line" line
        JOIN "Funding_Case_Account_Receivable_Credit_Memo" memo ON memo.id=line.egcs_fc_creditmemo
        WHERE line.egcs_fc_receivable=source."receivableId"::bigint AND memo.egcs_fc_currency=${currency}
          AND memo.egcs_fc_outcome='posted' AND NOT line._deleted AND NOT memo._deleted),0)+${offsets})::text AS recovered,
      COALESCE((SELECT SUM(reduction.egcs_fc_amount)
        FROM "Funding_Case_Account_Receivable_Claim_Reduction" reduction
        JOIN "Funding_Case_Agreement_Claim_Line_Item" line ON line.id=reduction.egcs_fc_claimline
          AND line.egcs_fc_fundingagreementclaim=reduction.egcs_fc_claim AND line.egcs_fc_currency=${currency} AND NOT line._deleted
        WHERE reduction.egcs_fc_receivable=source."receivableId"::bigint AND reduction.egcs_fc_claim=source."claimId"::bigint
          AND reduction.egcs_fc_appliedat IS NOT NULL AND NOT reduction._deleted),0)::text AS applied
    FROM source
  `.execute(db)).rows
  return rows.flatMap(row => {
    const additional = subtractMoney(parseDatabaseMoney(row.recovered), parseDatabaseMoney(row.applied))
    return compareMoney(additional, ZERO) > 0
      ? [{ claimId: row.claimId, fiscalYearId: row.fiscalYearId, amount: subtractMoney(ZERO, additional) }]
      : []
  })
}
