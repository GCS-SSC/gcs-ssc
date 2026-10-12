import type { Kysely, Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { FundingCaseAgreementPaymentCreate } from '~~/shared/types/schemas'
import type { PaymentEvidence } from '~~/shared/types/payment-evidence'
import { createExtensionAgreementFinancials } from './extension-agreement-financials'
import { getAgreementCommitmentLineBalances } from './agreement-commitment-line-balances'

/**
 * Captures host inputs before an authorized Payment insert or editable recalculation.
 * @param db - The host locked write transaction.
 * @param agreementId - Authorized owning Agreement.
 * @param commitmentId - Selected active Commitment.
 * @param input - Validated Payment selections.
 * @param fiscalYearDisplay - Calculation-time fiscal year label resolved by the host.
 * @param options - Excludes the edited Payment from its own financial basis.
 * @param options.excludePaymentId - Current Payment identity during an edit.
 * @returns Retained exact financial inputs and bilingual coding facts.
 */
export const captureAgreementPaymentEvidence = async (
  db: Kysely<Database> | Transaction<Database>,
  agreementId: string,
  commitmentId: string,
  input: FundingCaseAgreementPaymentCreate,
  fiscalYearDisplay: string,
  options: { excludePaymentId?: string } = {}
): Promise<PaymentEvidence> => {
  const financialInputs = await createExtensionAgreementFinancials(db, agreementId).getPaymentCalculation({
    fiscalYearId: input.egcs_fc_fiscalyear,
    commitmentTypeId: input.egcs_fc_commitmenttype,
    currency: input.egcs_fc_currency,
    paymentType: input.egcs_fc_paymenttype,
    periodStart: input.egcs_fc_periodstart,
    periodEnd: input.egcs_fc_periodend,
    ...(options.excludePaymentId ? { excludePaymentId: options.excludePaymentId } : {})
  })
  const lines = await getAgreementCommitmentLineBalances(db, agreementId, commitmentId, {
    fiscalYearId: input.egcs_fc_fiscalyear, currency: input.egcs_fc_currency,
    ...(options.excludePaymentId ? { excludePaymentId: options.excludePaymentId } : {})
  })
  return { version: 1, capturedAt: new Date().toISOString(),
    selection: { fiscalYearId: input.egcs_fc_fiscalyear, fiscalYearDisplay, commitmentTypeId: input.egcs_fc_commitmenttype,
      currency: input.egcs_fc_currency, paymentType: input.egcs_fc_paymenttype, periodStart: input.egcs_fc_periodstart,
      periodEnd: input.egcs_fc_periodend, paymentAmount: input.egcs_fc_paymentamount }, financialInputs,
    commitmentBalances: { commitmentId, currency: input.egcs_fc_currency, lines } }
}
