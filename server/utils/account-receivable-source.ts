/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns -- Live extraction is deliberately separate from retained AR reads. */
import type { H3Event } from 'h3'
import { sql, type Kysely } from 'kysely'
import type { Database, Currency_Codes, JsonValue } from '~~/shared/types/database'
import { moneyToCents, parseMoney, subtractMoney, sumMoney, type Money } from '~~/shared/utils/money'
import { authorize, authorizeWithFreshAuthContext, type AuthContext } from './authorize'
import { resolveAgreementScopeContext } from './agreement'
import { notFound, throwApiError } from './api-errors'
import { databaseMoneyText, parseDatabaseMoney } from './database-money'
import { agreementPaymentIsFinal } from './agreement-payment-source'
import { hasPositiveCompletionTerminus } from './completion-terminus'
import { readEffectiveCorrectionAdjustments, readEffectiveAccountReceivableRecoveries, readEffectiveAccountReceivableClaimRecoveries } from './agreement-accounting-projection'
import { allocateRetainedAccountReceivableCoding } from './account-receivable'

export type AccountReceivableSourceInput = { agreementId: string; applicantRecipientId: string; agencyFiscalYearId: string;
  type: 'ineligible_expense' | 'outstanding_advance'; currency: Currency_Codes }
export type CapturedAccountReceivableSource = { id: string; label_en: string; label_fr: string; egcs_fc_sourceamount: Money;
  egcs_fc_claim: string | null; egcs_fc_claimline: string | null; egcs_fc_reconcileline: string | null;
  egcs_fc_payment: string | null; egcs_fc_periodstart: number; egcs_fc_periodend: number; egcs_fc_evidence: JsonValue;
  coding: Array<{ egcs_fc_commitmentline: string; egcs_fc_chartofaccount: string; egcs_fc_agencychartofaccount: string;
    egcs_fc_agencyfiscalyear: string; egcs_fc_periodstart: number; egcs_fc_periodend: number;
    egcs_fc_paidbasis: Money; egcs_fc_accountingdimensions: JsonValue }> }

const zero = parseMoney('0.00')
const json = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value)) as JsonValue
export const accountReceivableError = async (event: H3Event, code: string): Promise<never> => {
  await throwApiError(event, { statusCode: 409, code,
    key: code === 'AR_BELOW_RECOVERED' ? 'apiErrors.account_receivable.below_recovered_reserved' : 'apiErrors.account_receivable.invalid_entry' })
  throw new Error(code)
}

export const requireAccountReceivableSourceRead = async (event: H3Event, db: Kysely<Database>, agreementId: string, auth?: AuthContext) => {
  const context = await resolveAgreementScopeContext(agreementId, db)
  if (!context) return await notFound(event, 'ACCOUNT_RECEIVABLE_NOT_FOUND', 'apiErrors.account_receivable.not_found')
  if (auth) await authorizeWithFreshAuthContext(event, auth, 'agreement', 'read', context.scope)
  else await authorize(event, 'agreement', 'read', context.scope)
  return context
}

/** Retains final reconciled Claim amounts and actual paid source periods, never submitted expenses. */
export const readAccountReceivableSources = async (db: Kysely<Database>, input: AccountReceivableSourceInput): Promise<CapturedAccountReceivableSource[]> => {
  const cashRows = await db.selectFrom('Funding_Case_Agreement_Payment_Line as line')
    .innerJoin('Funding_Case_Agreement_Payment as payment', 'payment.id', 'line.egcs_fc_fundingagreementpayment')
    .innerJoin('Funding_Case_Agreement_Budget_Fiscal_Year as year', 'year.id', 'payment.egcs_fc_fiscalyear')
    .innerJoin('Funding_Case_Agreement_Commitment_Line as commitment', 'commitment.id', 'line.egcs_fc_fundingagreementcommitmentline')
    .innerJoin('Transfer_Payment_Stream_Chart_of_Account as coding', 'coding.id', 'commitment.egcs_fc_transferpaymentstreamchartofaccount')
    .innerJoin('Agency_Chart_of_Account as chart', 'chart.id', 'coding.egcs_tp_agencychartofaccount')
    .select(['line.id', 'payment.id as paymentId', 'payment.egcs_fc_periodstart', 'payment.egcs_fc_periodend',
      'payment.egcs_fc_applicantrecipient', 'commitment.id as commitmentId', 'coding.id as codingId', 'chart.id as chartId',
      'chart.egcs_ay_accountingdimensions', databaseMoneyText(sql.ref('line.egcs_fc_amount')).as('amount')])
    .where('payment.egcs_fc_fundingagreement', '=', input.agreementId).where('year.egcs_fc_fiscalyear', '=', input.agencyFiscalYearId)
    .where('payment.egcs_fc_currency', '=', input.currency).where('chart.egcs_ay_currency', '=', input.currency)
    .where(agreementPaymentIsFinal('payment', { requireResolvedApproval: true })).where('line._deleted', '=', false).orderBy('line.id').execute()
  const voucherRows = await db.selectFrom('Funding_Case_Agreement_Journal_Voucher_Line as line')
    .innerJoin('Funding_Case_Agreement_Journal_Voucher as voucher', 'voucher.id', 'line.egcs_fc_journalvoucher')
    .innerJoin('Funding_Case_Agreement_Payment as payment', 'payment.id', 'voucher.egcs_fc_payment')
    .innerJoin('Funding_Case_Agreement_Budget_Fiscal_Year as year', 'year.id', 'payment.egcs_fc_fiscalyear')
    .innerJoin('Transfer_Payment_Stream_Chart_of_Account as coding', 'coding.id', 'line.egcs_fc_chartofaccount')
    .innerJoin('Agency_Chart_of_Account as chart', 'chart.id', 'coding.egcs_tp_agencychartofaccount')
    .select(['line.id', 'voucher.id as voucherId', 'payment.id as paymentId', 'payment.egcs_fc_periodstart', 'payment.egcs_fc_periodend',
      'payment.egcs_fc_applicantrecipient', 'line.egcs_fc_commitmentline as commitmentId', 'coding.id as codingId', 'chart.id as chartId',
      'chart.egcs_ay_accountingdimensions', databaseMoneyText(sql.ref('line.egcs_fc_amount')).as('amount')])
    .where('voucher.egcs_fc_fundingagreement', '=', input.agreementId).where('year.egcs_fc_fiscalyear', '=', input.agencyFiscalYearId)
    .where('voucher.egcs_fc_currency', '=', input.currency).where('chart.egcs_ay_currency', '=', input.currency)
    .where('line.egcs_fc_kind', '=', 'adjustment').where(agreementPaymentIsFinal('payment', { requireResolvedApproval: true }))
    .where('line._deleted', '=', false).where('voucher._deleted', '=', false).orderBy('line.id').execute()
  const paidSources = new Map<string, (typeof cashRows)[number]>()
  const retainPaidSource = (row: (typeof cashRows)[number]) => {
    const key = `${row.paymentId}:${row.commitmentId}:${row.codingId}:${row.egcs_fc_periodstart}:${row.egcs_fc_periodend}`
    const previous = paidSources.get(key)
    paidSources.set(key, { ...row, amount: sumMoney([previous ? parseDatabaseMoney(previous.amount) : zero, parseDatabaseMoney(row.amount)]) })
  }
  for (const row of cashRows) retainPaidSource(row)
  for (const row of voucherRows) if (await hasPositiveCompletionTerminus(db, 'fundingcasejournalvoucher', String(row.voucherId))) {
    const { voucherId: _voucherId, ...paidRow } = row
    retainPaidSource(paidRow)
  }
  const rows = [...paidSources.values()].map((row, index) => ({ ...row, id: String(index + 1) }))
  const applyPaidEffect = (effect: Money, eligible: (row: (typeof rows)[number]) => boolean): boolean => {
    const selected = rows.filter(row => eligible(row) && moneyToCents(parseDatabaseMoney(row.amount)) > BigInt(0))
    const effective = sumMoney([...selected.map(row => parseDatabaseMoney(row.amount)), effect])
    if (moneyToCents(effective) < BigInt(0) || (!selected.length && moneyToCents(effect) !== BigInt(0))) return false
    const splits = allocateRetainedAccountReceivableCoding(effective, selected.map(row => ({ id: row.id,
      basis: parseDatabaseMoney(row.amount), capacity: effective })))
    const apportioned = new Map(splits.map(row => [row.id, row.amount]))
    for (const row of selected) row.amount = apportioned.get(row.id) ?? zero
    return true
  }
  const [corrections, recoveries] = await Promise.all([readEffectiveCorrectionAdjustments(db, input.agreementId), readEffectiveAccountReceivableRecoveries(db, input.agreementId)])
  const effectiveCorrections = corrections.filter(row => row.currency === input.currency && String(row.agencyFiscalYearId) === input.agencyFiscalYearId)
  const correctionSources = effectiveCorrections.length
    ? await db.selectFrom('Funding_Case_Agreement_Correction_Source')
        .select(['egcs_fc_correction', 'egcs_fc_payment']).where('egcs_fc_correction', 'in', [...new Set(effectiveCorrections.map(row => String(row.correctionId)))])
        .where('_deleted', '=', false).execute()
    : []
  for (const effect of effectiveCorrections) {
    const sourcePayments = new Set(correctionSources.filter(row => String(row.egcs_fc_correction) === String(effect.correctionId)).map(row => String(row.egcs_fc_payment)))
    const eligible = (row: (typeof rows)[number]) => sourcePayments.has(String(row.paymentId))
      && String(row.commitmentId) === String(effect.commitmentLineId) && String(row.chartId) === String(effect.agencyChartId)
    const debtors = new Set(rows.filter(eligible).map(row => row.egcs_fc_applicantrecipient))
    // A Correction without unequivocal paid-source attribution cannot create a debtor balance.
    if (debtors.size !== 1 || debtors.has(null) || !applyPaidEffect(effect.amount, eligible)) return []
  }
  const effectiveRecoveries = recoveries.filter(row => row.currency === input.currency && String(row.agencyFiscalYearId) === input.agencyFiscalYearId)
  const recoveredDebtors = effectiveRecoveries.length
    ? new Map((await db.selectFrom('Funding_Case_Agreement_Account_Receivable')
        .select(['id', 'egcs_fc_applicantrecipient']).where('id', 'in', [...new Set(effectiveRecoveries.map(row => String(row.receivableId)))])
        .execute()).map(row => [String(row.id), String(row.egcs_fc_applicantrecipient)]))
    : new Map<string, string>()
  for (const effect of effectiveRecoveries) {
    const debtor = recoveredDebtors.get(String(effect.receivableId))
    if (!debtor || !applyPaidEffect(effect.amount, row => String(row.egcs_fc_applicantrecipient) === debtor
      && String(row.commitmentId) === String(effect.commitmentLineId) && String(row.chartId) === String(effect.agencyChartId)
      && row.egcs_fc_periodstart === effect.periodStart && row.egcs_fc_periodend === effect.periodEnd)) return []
  }
  // Ambiguous historical Payments cannot be silently assigned to any debtor.
  const paid = rows.filter(row => String(row.egcs_fc_applicantrecipient) === input.applicantRecipientId)
  const claimRows = await db.selectFrom('Funding_Case_Agreement_Claim_Reconcile_Line_Item as line')
    .innerJoin('Funding_Case_Agreement_Claim_Reconcile as reconcile', 'reconcile.id', 'line.egcs_fc_fundingagreementclaimreconcile')
    .innerJoin('Funding_Case_Agreement_Claim as claim', 'claim.id', 'reconcile.egcs_fc_fundingagreementclaim')
    .innerJoin('Funding_Case_Agreement_Claim_Line_Item as original', 'original.id', 'line.egcs_fc_lineitem')
    .innerJoin('Funding_Case_Agreement_Budget_Fiscal_Year as year', 'year.id', 'claim.egcs_fc_fiscalyear')
    .select(['line.id', 'reconcile.id as reconcileId', 'claim.id as claimId', 'original.id as claimLineId',
      'claim.egcs_fc_applicantrecipient as submittingProponentId',
      'original.egcs_fc_fundingagreementbudgetlineitem', 'original.egcs_fc_description', 'claim.egcs_fc_periodstart', 'claim.egcs_fc_periodend',
      databaseMoneyText(sql.ref('line.egcs_fc_reconciled')).as('amount')])
    .where('claim.egcs_fc_fundingagreement', '=', input.agreementId).where('year.egcs_fc_fiscalyear', '=', input.agencyFiscalYearId)
    .where('reconcile.egcs_fc_isfinal', '=', true).where('original.egcs_fc_currency', '=', input.currency)
    .where('line._deleted', '=', false).where('reconcile._deleted', '=', false).where('claim._deleted', '=', false)
    .where('original._deleted', '=', false).orderBy('claim.egcs_fc_periodstart').orderBy('line.id').execute()
  const finalClaims: typeof claimRows = []
  let ambiguousFinalClaim = false
  for (const row of claimRows) {
    if (moneyToCents(parseDatabaseMoney(row.amount)) > BigInt(0)
      && await hasPositiveCompletionTerminus(db, 'fundingclaimreconcile', String(row.reconcileId))) {
      if (row.submittingProponentId == null) ambiguousFinalClaim = true
      else if (String(row.submittingProponentId) === input.applicantRecipientId) finalClaims.push(row)
    }
  }
  const paidCoding = paid.flatMap(row => {
    const adjusted = parseDatabaseMoney(row.amount)
    if (moneyToCents(adjusted) <= BigInt(0)) return []
    return [{ egcs_fc_commitmentline: String(row.commitmentId), egcs_fc_chartofaccount: String(row.codingId),
      egcs_fc_agencychartofaccount: String(row.chartId), egcs_fc_agencyfiscalyear: input.agencyFiscalYearId,
      egcs_fc_periodstart: row.egcs_fc_periodstart, egcs_fc_periodend: row.egcs_fc_periodend,
      egcs_fc_paidbasis: adjusted, egcs_fc_accountingdimensions: json(row.egcs_ay_accountingdimensions) }]
  })
  const consolidatedCoding = new Map<string, CapturedAccountReceivableSource['coding'][number]>()
  for (const row of paidCoding) {
    const key = `${row.egcs_fc_commitmentline}:${row.egcs_fc_chartofaccount}:${row.egcs_fc_periodstart}:${row.egcs_fc_periodend}`
    const previous = consolidatedCoding.get(key)
    consolidatedCoding.set(key, { ...row, egcs_fc_paidbasis: sumMoney([previous?.egcs_fc_paidbasis ?? zero, row.egcs_fc_paidbasis]) })
  }
  const coding = [...consolidatedCoding.values()]
  if (input.type === 'ineligible_expense') return finalClaims.map(row => ({ id: `claim:${row.id}`,
    label_en: `Claim ${row.claimId} · ${row.egcs_fc_description}`, label_fr: `Réclamation ${row.claimId} · ${row.egcs_fc_description}`,
    egcs_fc_sourceamount: parseDatabaseMoney(row.amount), egcs_fc_claim: String(row.claimId), egcs_fc_claimline: String(row.claimLineId),
    egcs_fc_reconcileline: String(row.id), egcs_fc_payment: null, egcs_fc_periodstart: row.egcs_fc_periodstart,
    egcs_fc_periodend: row.egcs_fc_periodend, egcs_fc_evidence: json(row), coding }))
  if (ambiguousFinalClaim) return []
  const claimRecoveries = await readEffectiveAccountReceivableClaimRecoveries(db, input.agreementId)
  const effectiveClaims = sumMoney(finalClaims.map(row => sumMoney([parseDatabaseMoney(row.amount), ...claimRecoveries
    .filter(recovery => String(recovery.reconcileLineId) === String(row.id)).map(recovery => recovery.amount)])))
  const available = subtractMoney(sumMoney(coding.map(item => item.egcs_fc_paidbasis)), effectiveClaims)
  if (moneyToCents(available) <= BigInt(0)) return []
  // Fiscal source identity is stable; consumption is independently capped for the explicit debtor.
  return [{ id: `advance:${input.agencyFiscalYearId}`, label_en: `Outstanding advance · ${input.agencyFiscalYearId}`,
    label_fr: `Avance impayée · ${input.agencyFiscalYearId}`, egcs_fc_sourceamount: available,
    egcs_fc_claim: null, egcs_fc_claimline: null, egcs_fc_reconcileline: null, egcs_fc_payment: paid[0] ? String(paid[0].paymentId) : null,
    egcs_fc_periodstart: 0, egcs_fc_periodend: 11, egcs_fc_evidence: json({ payments: paid, approvedClaims: finalClaims, formula: 'actual_paid_minus_final_approved_claims' }), coding }]
}
