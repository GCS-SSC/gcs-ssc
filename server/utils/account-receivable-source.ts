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
  claimRelated: boolean; advancePaymentRelated: boolean; currency: Currency_Codes }
export type CapturedAccountReceivableSource = { id: string; label_en: string; label_fr: string; egcs_fc_sourceamount: Money;
  egcs_fc_claim: string | null; egcs_fc_claimline: string | null; egcs_fc_reconcileline: string | null;
  egcs_fc_payment: string | null; egcs_fc_periodstart: number; egcs_fc_periodend: number; egcs_fc_evidence: JsonValue;
  coding: Array<{ egcs_fc_commitmentline: string; egcs_fc_chartofaccount: string; egcs_fc_agencychartofaccount: string;
    egcs_fc_agencyfiscalyear: string; egcs_fc_periodstart: number; egcs_fc_periodend: number;
    egcs_fc_paidbasis: Money; egcs_fc_sharedpaidbasis: Money; egcs_fc_accountingdimensions: JsonValue }> }

const zero = parseMoney('0.00')
const json = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value)) as JsonValue
export const accountReceivableError = async (event: H3Event, code: string): Promise<never> => {
  const keys: Record<string, string> = { AR_BELOW_RECOVERED: 'below_recovered_reserved', AR_RECOVERY_METHOD_REQUIRED: 'recovery_method_required',
    AR_ACCOUNT_REQUIRED: 'account_required', AR_ACCOUNT_UNAVAILABLE: 'account_required', AR_MONITOR_REQUIRED: 'monitor_required', AR_TYPE_UNAVAILABLE: 'type_unavailable' }
  await throwApiError(event, { statusCode: 409, code, key: `apiErrors.account_receivable.${keys[code] ?? 'invalid_entry'}` })
  throw new Error(code)
}

export const requireAccountReceivableSourceRead = async (event: H3Event, db: Kysely<Database>, agreementId: string, auth?: AuthContext) => {
  const context = await resolveAgreementScopeContext(agreementId, db)
  if (!context) return await notFound(event, 'ACCOUNT_RECEIVABLE_NOT_FOUND', 'apiErrors.account_receivable.not_found')
  if (auth) await authorizeWithFreshAuthContext(event, auth, 'agreement', 'read', context.scope)
  else await authorize(event, 'agreement', 'read', context.scope)
  return context
}

/** Retains approved reconciled Claim amounts and actual paid source periods, never submitted expenses. */
export const readAccountReceivableSources = async (db: Kysely<Database>, input: AccountReceivableSourceInput): Promise<CapturedAccountReceivableSource[]> => {
  if (input.claimRelated === input.advancePaymentRelated) throw new Error('AR_TYPE_FLAGS_INVALID')
  const cashRows = await db.selectFrom('Funding_Case_Agreement_Payment_Line as line')
    .innerJoin('Funding_Case_Agreement_Payment as payment', 'payment.id', 'line.egcs_fc_fundingagreementpayment')
    .innerJoin('Funding_Case_Agreement_Budget_Fiscal_Year as year', 'year.id', 'payment.egcs_fc_fiscalyear')
    .innerJoin('Funding_Case_Agreement_Commitment_Line as commitment', 'commitment.id', 'line.egcs_fc_fundingagreementcommitmentline')
    .innerJoin('Transfer_Payment_Stream_Chart_of_Account as coding', 'coding.id', 'commitment.egcs_fc_transferpaymentstreamchartofaccount')
    .innerJoin('Agency_Chart_of_Account as chart', 'chart.id', 'coding.egcs_tp_agencychartofaccount')
    .select(['line.id', 'payment.id as paymentId', 'payment.egcs_fc_periodstart', 'payment.egcs_fc_periodend',
      'payment.egcs_fc_applicantrecipient', 'payment.egcs_fc_paymenttype', 'chart.egcs_ay_fiscalyear as codingFiscalYearId', 'year.egcs_fc_fiscalyear as paymentFiscalYearId', 'commitment.id as commitmentId', 'coding.id as codingId', 'chart.id as chartId',
      'chart.egcs_ay_accountingdimensions', databaseMoneyText(sql.ref('line.egcs_fc_amount')).as('amount')])
    .where('payment.egcs_fc_fundingagreement', '=', input.agreementId)
    .where('payment.egcs_fc_currency', '=', input.currency).where('chart.egcs_ay_currency', '=', input.currency)
    .where(agreementPaymentIsFinal('payment', { requireResolvedApproval: true })).where('line._deleted', '=', false).orderBy('line.id').execute()
  const voucherRows = await db.selectFrom('Funding_Case_Agreement_Journal_Voucher_Line as line')
    .innerJoin('Funding_Case_Agreement_Journal_Voucher as voucher', 'voucher.id', 'line.egcs_fc_journalvoucher')
    .innerJoin('Funding_Case_Agreement_Payment as payment', 'payment.id', 'voucher.egcs_fc_payment')
    .innerJoin('Funding_Case_Agreement_Budget_Fiscal_Year as year', 'year.id', 'payment.egcs_fc_fiscalyear')
    .innerJoin('Transfer_Payment_Stream_Chart_of_Account as coding', 'coding.id', 'line.egcs_fc_chartofaccount')
    .innerJoin('Agency_Chart_of_Account as chart', 'chart.id', 'coding.egcs_tp_agencychartofaccount')
    .select(['line.id', 'voucher.id as voucherId', 'payment.id as paymentId', 'payment.egcs_fc_periodstart', 'payment.egcs_fc_periodend',
      'payment.egcs_fc_applicantrecipient', 'payment.egcs_fc_paymenttype', 'chart.egcs_ay_fiscalyear as codingFiscalYearId', 'year.egcs_fc_fiscalyear as paymentFiscalYearId', 'line.egcs_fc_commitmentline as commitmentId', 'coding.id as codingId', 'chart.id as chartId',
      'chart.egcs_ay_accountingdimensions', databaseMoneyText(sql.ref('line.egcs_fc_amount')).as('amount')])
    .where('voucher.egcs_fc_fundingagreement', '=', input.agreementId)
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
  const effectiveCorrections = corrections.filter(row => row.currency === input.currency)
  const correctionSources = effectiveCorrections.length
    ? await db.selectFrom('Funding_Case_Agreement_Correction_Source')
        .select(['egcs_fc_correction', 'egcs_fc_payment']).where('egcs_fc_correction', 'in', [...new Set(effectiveCorrections.map(row => String(row.correctionId)))])
        .where('_deleted', '=', false).execute()
    : []
  for (const effect of effectiveCorrections) {
    const sourcePayments = new Set(correctionSources.filter(row => String(row.egcs_fc_correction) === String(effect.correctionId)).map(row => String(row.egcs_fc_payment)))
    if (!rows.some(row => sourcePayments.has(String(row.paymentId)))) continue
    const eligible = (row: (typeof rows)[number]) => sourcePayments.has(String(row.paymentId))
      && String(row.commitmentId) === String(effect.commitmentLineId) && String(row.chartId) === String(effect.agencyChartId)
      && String(row.codingFiscalYearId) === String(effect.agencyFiscalYearId)
    const debtors = new Set(rows.filter(eligible).map(row => row.egcs_fc_applicantrecipient))
    if (!debtors.has(input.applicantRecipientId)) continue
    // A Correction without unequivocal paid-source attribution cannot create a debtor balance.
    if (debtors.size !== 1 || debtors.has(null) || !applyPaidEffect(effect.amount, eligible)) return []
  }
  const effectiveRecoveries = recoveries.filter(row => row.currency === input.currency)
  const recoveredDebtors = effectiveRecoveries.length
    ? new Map((await db.selectFrom('Funding_Case_Agreement_Account_Receivable')
        .select(['id', 'egcs_fc_applicantrecipient', 'egcs_fc_agencyfiscalyear']).where('id', 'in', [...new Set(effectiveRecoveries.map(row => String(row.receivableId)))])
        .execute()).map(row => [String(row.id), { debtor: String(row.egcs_fc_applicantrecipient), year: String(row.egcs_fc_agencyfiscalyear) }]))
    : new Map<string, { debtor: string; year: string }>()
  const recoverySources = effectiveRecoveries.length
    ? new Map((await db.selectFrom('Funding_Case_Account_Receivable_Posting as posting')
        .innerJoin('Funding_Case_Agreement_Account_Receivable_Coding as coding', 'coding.id', 'posting.egcs_fc_coding')
        .innerJoin('Funding_Case_Agreement_Account_Receivable_Line as source', 'source.id', 'coding.egcs_fc_receivableline')
        .select(['posting.id', 'source.egcs_fc_payment']).where('posting.id', 'in', effectiveRecoveries.map(row => String(row.id))).execute())
        .map(row => [String(row.id), row.egcs_fc_payment]))
    : new Map<string, string | null>()
  for (const effect of effectiveRecoveries) {
    const owner = recoveredDebtors.get(String(effect.receivableId))
    if (owner && owner.debtor !== input.applicantRecipientId) continue
    const debtor = owner?.debtor
    if (!debtor || !applyPaidEffect(effect.amount, row => String(row.egcs_fc_applicantrecipient) === debtor
      && String(row.paymentFiscalYearId) === owner?.year
      && String(row.commitmentId) === String(effect.commitmentLineId) && String(row.chartId) === String(effect.agencyChartId)
      && String(row.codingFiscalYearId) === String(effect.agencyFiscalYearId)
      && (!recoverySources.get(String(effect.id)) || String(row.paymentId) === String(recoverySources.get(String(effect.id))))
      && row.egcs_fc_periodstart === effect.periodStart && row.egcs_fc_periodend === effect.periodEnd)) return []
  }
  // Ambiguous historical Payments cannot be silently assigned to any debtor.
  const debtorPaid = rows.filter(row => String(row.egcs_fc_applicantrecipient) === input.applicantRecipientId)
  const paid = debtorPaid.filter(row => String(row.paymentFiscalYearId) === input.agencyFiscalYearId)
  let claimQuery = db.selectFrom('Funding_Case_Agreement_Claim_Reconcile_Line_Item as line')
    .innerJoin('Funding_Case_Agreement_Claim_Reconcile as reconcile', 'reconcile.id', 'line.egcs_fc_fundingagreementclaimreconcile')
    .innerJoin('Funding_Case_Agreement_Claim as claim', 'claim.id', 'reconcile.egcs_fc_fundingagreementclaim')
    .innerJoin('Funding_Case_Agreement_Claim_Line_Item as original', 'original.id', 'line.egcs_fc_lineitem')
    .innerJoin('Funding_Case_Agreement_Budget_Fiscal_Year as year', 'year.id', 'claim.egcs_fc_fiscalyear')
    .select(['line.id', 'reconcile.id as reconcileId', 'claim.id as claimId', 'original.id as claimLineId',
      'claim.egcs_fc_applicantrecipient as submittingProponentId',
      'original.egcs_fc_fundingagreementbudgetlineitem', 'original.egcs_fc_description', 'claim.egcs_fc_periodstart', 'claim.egcs_fc_periodend',
      databaseMoneyText(sql.ref('line.egcs_fc_reconciled')).as('amount')])
    .where('claim.egcs_fc_fundingagreement', '=', input.agreementId).where('year.egcs_fc_fiscalyear', '=', input.agencyFiscalYearId)
    .where('original.egcs_fc_currency', '=', input.currency)
    .where('line._deleted', '=', false).where('reconcile._deleted', '=', false).where('claim._deleted', '=', false)
    .where('original._deleted', '=', false)
  // Claim debt may use any approved reconciliation; advance consumption retains
  // the existing final-reconciliation basis for the debtor's fiscal balance.
  if (input.advancePaymentRelated) claimQuery = claimQuery.where('reconcile.egcs_fc_isfinal', '=', true)
  const claimRows = await claimQuery.orderBy('claim.egcs_fc_periodstart').orderBy('line.id').execute()
  const approvedClaims: typeof claimRows = []
  let ambiguousApprovedClaim = false
  for (const row of claimRows) {
    if (moneyToCents(parseDatabaseMoney(row.amount)) > BigInt(0)
      && await hasPositiveCompletionTerminus(db, 'fundingclaimreconcile', String(row.reconcileId))) {
      if (row.submittingProponentId == null) ambiguousApprovedClaim = true
      else if (String(row.submittingProponentId) === input.applicantRecipientId) approvedClaims.push(row)
    }
  }
  const codingFor = (paidRows: typeof paid): CapturedAccountReceivableSource['coding'] => {
    const consolidated = new Map<string, CapturedAccountReceivableSource['coding'][number]>()
    for (const row of paidRows) {
      const amount = parseDatabaseMoney(row.amount)
      if (moneyToCents(amount) <= BigInt(0)) continue
      const item = { egcs_fc_commitmentline: String(row.commitmentId), egcs_fc_chartofaccount: String(row.codingId),
        egcs_fc_agencychartofaccount: String(row.chartId), egcs_fc_agencyfiscalyear: String(row.codingFiscalYearId),
        egcs_fc_periodstart: row.egcs_fc_periodstart, egcs_fc_periodend: row.egcs_fc_periodend,
        egcs_fc_paidbasis: amount, egcs_fc_sharedpaidbasis: amount, egcs_fc_accountingdimensions: json(row.egcs_ay_accountingdimensions) }
      const key = `${item.egcs_fc_commitmentline}:${item.egcs_fc_chartofaccount}:${item.egcs_fc_agencyfiscalyear}:${item.egcs_fc_periodstart}:${item.egcs_fc_periodend}`
      const previous = consolidated.get(key)
      consolidated.set(key, { ...item, egcs_fc_paidbasis: sumMoney([previous?.egcs_fc_paidbasis ?? zero, amount]), egcs_fc_sharedpaidbasis: sumMoney([previous?.egcs_fc_paidbasis ?? zero, amount]) })
    }
    return [...consolidated.values()]
  }
  // Original coding capacity spans every source fiscal year sharing that chart axis.
  // Source weights and unused advance entitlement remain in the selected Payment FY.
  const sharedCoding = codingFor(debtorPaid)
  const withSharedBasis = (items: CapturedAccountReceivableSource['coding']) => items.map(row => ({ ...row,
    egcs_fc_sharedpaidbasis: sharedCoding.find(pool => pool.egcs_fc_commitmentline === row.egcs_fc_commitmentline
      && pool.egcs_fc_chartofaccount === row.egcs_fc_chartofaccount && pool.egcs_fc_agencyfiscalyear === row.egcs_fc_agencyfiscalyear
      && pool.egcs_fc_periodstart === row.egcs_fc_periodstart && pool.egcs_fc_periodend === row.egcs_fc_periodend)?.egcs_fc_paidbasis ?? row.egcs_fc_paidbasis }))
  const coding = withSharedBasis(codingFor(paid))
  if (input.claimRelated) return approvedClaims.map(row => ({ id: `claim:${row.id}`,
    label_en: `Claim ${row.claimId} · ${row.egcs_fc_description}`, label_fr: `Réclamation ${row.claimId} · ${row.egcs_fc_description}`,
    egcs_fc_sourceamount: parseDatabaseMoney(row.amount), egcs_fc_claim: String(row.claimId), egcs_fc_claimline: String(row.claimLineId),
    egcs_fc_reconcileline: String(row.id), egcs_fc_payment: null, egcs_fc_periodstart: row.egcs_fc_periodstart,
    egcs_fc_periodend: row.egcs_fc_periodend, egcs_fc_evidence: json(row), coding }))
  if (ambiguousApprovedClaim) return []
  const claimRecoveries = await readEffectiveAccountReceivableClaimRecoveries(db, input.agreementId)
  const effectiveClaims = sumMoney(approvedClaims.map(row => sumMoney([parseDatabaseMoney(row.amount), ...claimRecoveries
    .filter(recovery => String(recovery.reconcileLineId) === String(row.id)).map(recovery => recovery.amount)])))
  const unclaimed = subtractMoney(sumMoney(coding.map(item => item.egcs_fc_paidbasis)), effectiveClaims)
  const advances = paid.filter(row => row.egcs_fc_paymenttype === 'advance')
  const advanceTotal = sumMoney(codingFor(advances).map(item => item.egcs_fc_paidbasis))
  const available = moneyToCents(unclaimed) < moneyToCents(advanceTotal) ? unclaimed : advanceTotal
  if (moneyToCents(available) <= BigInt(0)) return []
  const paymentIds = [...new Set(advances.map(row => String(row.paymentId)))].sort((left, right) => BigInt(left) < BigInt(right) ? -1 : 1)
  return paymentIds.flatMap(paymentId => {
    const paymentRows = advances.filter(row => String(row.paymentId) === paymentId)
    const paymentCoding = withSharedBasis(codingFor(paymentRows))
    const paidAmount = sumMoney(paymentCoding.map(item => item.egcs_fc_paidbasis))
    if (moneyToCents(paidAmount) <= BigInt(0)) return []
    const source = paymentRows[0]!
    return [{ id: `advance:${paymentId}`, label_en: `Advance Payment ${paymentId}`, label_fr: `Paiement d’avance ${paymentId}`,
      egcs_fc_sourceamount: moneyToCents(paidAmount) < moneyToCents(available) ? paidAmount : available,
      egcs_fc_claim: null, egcs_fc_claimline: null, egcs_fc_reconcileline: null, egcs_fc_payment: paymentId,
      egcs_fc_periodstart: source.egcs_fc_periodstart, egcs_fc_periodend: source.egcs_fc_periodend,
      egcs_fc_evidence: json({ payments: paymentRows, approvedClaims, egcs_fc_fiscaloutstanding: available,
        formula: 'minimum_actual_advance_paid_and_actual_paid_minus_final_approved_claims' }), coding: paymentCoding }]
  })
}
