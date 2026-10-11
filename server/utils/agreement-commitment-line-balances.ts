import { sql, type Kysely } from 'kysely'
import type { Currency_Codes, Database } from '~~/shared/types/database'
import type { TransferPaymentStreamChartOfAccountDimension } from '~~/shared/types/schemas/transfer-payment'
import type { FundingCaseAgreementCommitmentLineBalanceRow } from '~~/shared/types/funding-case-agreement-ui'
import { compareMoney, parseMoney, subtractMoney, sumMoney } from '~~/shared/utils/money'
import { readEffectiveAccountReceivableRecoveries } from './agreement-accounting-projection'
import { budgetFiscalYearStableId } from './agreement-budget-lineage'
import { getCommitmentLinePaymentCoverage } from './agreement-commitment-line-balance'
import { databaseMoneyText, parseDatabaseMoney } from './database-money'

/**
 * Reads authored coding and the same net paid floors enforced when writing Payments.
 * @param db - Authorized read snapshot.
 * @param agreementId - Owning Agreement.
 * @param commitmentId - Selected Commitment, including inactive detail records.
 * @param options - Optional Payment preview selection.
 * @param options.fiscalYearId - Stable Agreement budget fiscal year.
 * @param options.currency - Native selected currency.
 * @returns Exact money coding rows and posted linked credits.
 */
export const getAgreementCommitmentLineBalances = async (
  db: Kysely<Database>,
  agreementId: string,
  commitmentId: string,
  options: { fiscalYearId?: string; currency?: Currency_Codes } = {}
): Promise<FundingCaseAgreementCommitmentLineBalanceRow[]> => {
  let query = db.selectFrom('Funding_Case_Agreement_Commitment_Line as line')
    .innerJoin('Funding_Case_Agreement_Commitment as commitment', 'commitment.id', 'line.egcs_fc_commitment')
    .innerJoin('Transfer_Payment_Stream_Chart_of_Account as coding', 'coding.id', 'line.egcs_fc_transferpaymentstreamchartofaccount')
    .innerJoin('Agency_Chart_of_Account as account', 'account.id', 'coding.egcs_tp_agencychartofaccount')
    .innerJoin('Agency_Fiscal_Year as year', 'year.id', 'account.egcs_ay_fiscalyear')
    .select(['line.id', 'line.egcs_fc_commitment', 'line.egcs_fc_commitmentlinenumber',
      'line.egcs_fc_transferpaymentstreamchartofaccount', databaseMoneyText(sql.ref('line.egcs_fc_amount')).as('egcs_fc_amount'),
      'year.egcs_ay_fiscalyeardisplay as fiscal_year_display', 'account.egcs_ay_accountingdimensions as accounting_dimensions',
      'commitment.egcs_fc_currency as currency'])
    .where('line.egcs_fc_commitment', '=', commitmentId).where('commitment.egcs_fc_fundingagreement', '=', agreementId)
    .where('line._deleted', '=', false).where('commitment._deleted', '=', false)
    .whereRef('account.egcs_ay_currency', '=', 'commitment.egcs_fc_currency')
    .orderBy('line.egcs_fc_commitmentlinenumber', 'asc').orderBy('line.id', 'asc')
  if (options.currency) query = query.where('commitment.egcs_fc_currency', '=', options.currency)
  if (options.fiscalYearId) {
    query = query.innerJoin('Funding_Case_Agreement_Budget_Fiscal_Year',
      'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fiscalyear', 'account.egcs_ay_fiscalyear')
      .innerJoin('Funding_Case_Agreement_Budget_Version', 'Funding_Case_Agreement_Budget_Version.id',
        'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_budgetversion')
      .where(budgetFiscalYearStableId, '=', options.fiscalYearId)
      .where('Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fundingagreement', '=', agreementId)
      .where('Funding_Case_Agreement_Budget_Fiscal_Year._deleted', '=', false)
      .where('Funding_Case_Agreement_Budget_Version.egcs_fc_iscurrent', '=', true)
      .where('Funding_Case_Agreement_Budget_Version._deleted', '=', false)
  }
  const lines = await query.execute()
  if (!lines.length) return []
  const recoveries = await readEffectiveAccountReceivableRecoveries(db, agreementId, { currency: options.currency })
  const zero = parseMoney('0.00')
  return await Promise.all(lines.map(async ({ currency, ...line }) => {
    const amount = parseDatabaseMoney(line.egcs_fc_amount)
    const { paidAmount } = await getCommitmentLinePaymentCoverage(db, String(line.id), { currency })
    const balance = subtractMoney(amount, paidAmount)
    const credits = sumMoney(recoveries.filter(row => row.currency === currency && String(row.commitmentLineId) === String(line.id)).map(row => row.amount))
    return { ...line, id: String(line.id), egcs_fc_commitment: String(line.egcs_fc_commitment),
      egcs_fc_transferpaymentstreamchartofaccount: String(line.egcs_fc_transferpaymentstreamchartofaccount),
      accounting_dimensions: line.accounting_dimensions as TransferPaymentStreamChartOfAccountDimension[],
      egcs_fc_amount: amount, egcs_fc_paidamount: paidAmount,
      egcs_fc_creditmemoamount: subtractMoney(zero, credits), egcs_fc_balance: compareMoney(balance, zero) < 0 ? zero : balance }
  }))
}
