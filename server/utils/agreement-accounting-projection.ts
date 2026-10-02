/* eslint-disable jsdoc/require-param, jsdoc/require-returns -- Host-owned exact financial projection. */
import { sql, type Kysely } from 'kysely'
import type { Currency_Codes, Database } from '~~/shared/types/database'
import { CURRENCY_CODES_ENUM } from '~~/shared/constants/enums'
import { addMoney, parseMoney, sumMoney, type Money } from '~~/shared/utils/money'
import { databaseMoneyText, parseDatabaseMoney } from './database-money'
import { hasPositiveCompletionTerminus } from './completion-terminus'
import { agreementPaymentIsFinal, agreementPaymentApprovalIsEligible } from './agreement-payment-source'
import { hasAccountingTable, hasCorrectionSchema } from './correction-schema'

const ZERO = parseMoney('0.00')

/** Effective signed entries preserve exact-line attribution and owning Agency coding identity. */
export const readEffectiveCorrectionAdjustments = async (
  db: Kysely<Database>, agreementId: string, options: { currency?: Currency_Codes } = {}
) => {
  if (!await hasCorrectionSchema(db)) return []
  let query = db.selectFrom('Funding_Case_Agreement_Correction_Adjustment as adjustment')
    .innerJoin('Funding_Case_Agreement_Correction as correction', 'correction.id', 'adjustment.egcs_fc_correction')
    .innerJoin('Transfer_Payment_Stream_Chart_of_Account as coding', 'coding.id', 'adjustment.egcs_fc_chartofaccount')
    .select(['adjustment.egcs_fc_commitmentline as commitmentLineId', 'coding.egcs_tp_agencychartofaccount as agencyChartId',
      'adjustment.egcs_fc_agencyfiscalyear as agencyFiscalYearId', 'correction.id as correctionId',
      'correction.egcs_fc_currency as currency', 'correction.egcs_fc_requesteddate as accountingDate',
      databaseMoneyText(sql.ref('adjustment.egcs_fc_amount')).as('amount')])
    .where('correction.egcs_fc_fundingagreement', '=', agreementId)
    .where('adjustment.egcs_fc_fundingagreement', '=', agreementId)
    .where('correction.egcs_fc_outcome', '=', 'posted')
    .where('correction._deleted', '=', false).where('adjustment._deleted', '=', false)
  if (options.currency) query = query.where('correction.egcs_fc_currency', '=', options.currency)
  const rows = await query.execute()
  return rows.map(row => ({ ...row, amount: parseDatabaseMoney(row.amount) }))
}

/** Actual recorded paid components, never the protective paid floor used by capacity checks. */
export const getAgreementAccountingLines = async (
  db: Kysely<Database>, agreementId: string,
  options: { excludePaymentId?: string; paymentMode?: 'reserved' | 'finalized' } = {}
) => {
  const lines = await db.selectFrom('Funding_Case_Agreement_Commitment_Line as line')
    .innerJoin('Funding_Case_Agreement_Commitment as commitment', 'commitment.id', 'line.egcs_fc_commitment')
    .innerJoin('Transfer_Payment_Stream_Chart_of_Account as coding', 'coding.id', 'line.egcs_fc_transferpaymentstreamchartofaccount')
    .innerJoin('Agency_Chart_of_Account as account', 'account.id', 'coding.egcs_tp_agencychartofaccount')
    .innerJoin('Agency_Fiscal_Year as year', 'year.id', 'account.egcs_ay_fiscalyear')
    .select(['line.id', 'line.egcs_fc_commitment', 'line.egcs_fc_commitmentlinenumber',
      'coding.id as egcs_fc_chartofaccount', 'account.id as egcs_fc_agencychartofaccount', 'commitment.egcs_fc_currency as currency',
      'account.egcs_ay_accountingdimensions as egcs_fc_accountingdimensions',
      'account.egcs_ay_fiscalyear as egcs_fc_agencyfiscalyear', 'year.egcs_ay_fiscalyeardisplay as egcs_fc_fiscalyeardisplay',
      'year.egcs_ay_fiscalyear as egcs_fc_fiscalyearorder',
      databaseMoneyText(sql.ref('line.egcs_fc_amount')).as('egcs_fc_commitmentamount')])
    .where('line.egcs_fc_fundingagreement', '=', agreementId).where('commitment.egcs_fc_fundingagreement', '=', agreementId)
    .where('commitment.egcs_fc_active', '=', true).where('commitment._deleted', '=', false).where('line._deleted', '=', false)
    .orderBy('line.id').execute()
  let paymentsQuery = db.selectFrom('Funding_Case_Agreement_Payment_Line as line')
    .innerJoin('Funding_Case_Agreement_Payment as payment', 'payment.id', 'line.egcs_fc_fundingagreementpayment')
    .select(['payment.id as paymentId', 'payment.egcs_fc_currency as currency', 'line.egcs_fc_fundingagreementcommitmentline as commitmentLineId',
      databaseMoneyText(sql.ref('line.egcs_fc_amount')).as('amount')])
    .where('payment.egcs_fc_fundingagreement', '=', agreementId)
    .where('payment._deleted', '=', false).where('line._deleted', '=', false)
    .where(agreementPaymentApprovalIsEligible('payment'))
  if (options.excludePaymentId) paymentsQuery = paymentsQuery.where('payment.id', '!=', options.excludePaymentId)
  if (options.paymentMode === 'finalized') paymentsQuery = paymentsQuery.where(agreementPaymentIsFinal('payment', { requireResolvedApproval: true }))
  const payments = await paymentsQuery.execute()
  const voucherRows = await db.selectFrom('Funding_Case_Agreement_Journal_Voucher_Line as line')
    .innerJoin('Funding_Case_Agreement_Journal_Voucher as voucher', 'voucher.id', 'line.egcs_fc_journalvoucher')
    .innerJoin('Funding_Case_Agreement_Payment as payment', 'payment.id', 'voucher.egcs_fc_payment')
    .innerJoin('Transfer_Payment_Stream_Chart_of_Account as coding', 'coding.id', 'line.egcs_fc_chartofaccount')
    .select(['voucher.id as voucherId', 'voucher.egcs_fc_currency as currency', 'voucher.egcs_fc_payment as paymentId',
      'line.egcs_fc_commitmentline as commitmentLineId', 'coding.egcs_tp_agencychartofaccount as agencyChartId',
      databaseMoneyText(sql.ref('line.egcs_fc_amount')).as('amount')])
    .where('voucher.egcs_fc_fundingagreement', '=', agreementId).where('line.egcs_fc_kind', '=', 'adjustment')
    .where(options.paymentMode === 'finalized' ? agreementPaymentIsFinal('payment', { requireResolvedApproval: true }) : sql<boolean>`true`)
    .where(agreementPaymentApprovalIsEligible('payment'))
    .where('voucher._deleted', '=', false).where('line._deleted', '=', false).where('payment._deleted', '=', false).execute()
  const successful = new Set<string>()
  for (const id of new Set(voucherRows.map(row => String(row.voucherId)))) {
    if (await hasPositiveCompletionTerminus(db, 'fundingcasejournalvoucher', id)) successful.add(id)
  }
  const corrections = await readEffectiveCorrectionAdjustments(db, agreementId)
  return lines.map(line => {
    const original = sumMoney(payments.filter(row => row.currency === line.currency && String(row.commitmentLineId) === String(line.id))
      .map(row => parseDatabaseMoney(row.amount)))
    // JV incoming coding belongs to its shared pool; it is attributed to this exact line only for this same coding.
    const jv = sumMoney(voucherRows.filter(row => row.currency === line.currency && successful.has(String(row.voucherId))
      && String(row.paymentId) !== options.excludePaymentId && String(row.commitmentLineId) === String(line.id)
      && String(row.agencyChartId) === String(line.egcs_fc_agencychartofaccount)).map(row => parseDatabaseMoney(row.amount)))
    const prior = sumMoney(corrections.filter(row => row.currency === line.currency && String(row.commitmentLineId) === String(line.id)).map(row => row.amount))
    return { ...line, egcs_fc_commitmentamount: parseDatabaseMoney(line.egcs_fc_commitmentamount),
      egcs_fc_originalpaid: original, egcs_fc_jveffect: jv, egcs_fc_priorcorrections: prior,
      egcs_fc_correctedpaid: sumMoney([original, jv, prior]) }
  })
}

/** Coding capacity combines the entire owning Agreement once per Agency coding key. */
export const getAgreementAccountingCodingPools = async (db: Kysely<Database>, agreementId: string) => {
  const lines = await getAgreementAccountingLines(db, agreementId, { paymentMode: 'finalized' })
  const pools = new Map<string, { committed: Money; paid: Money }>()
  for (const line of lines) {
    const key = String(line.egcs_fc_agencychartofaccount)
    const pool = pools.get(key) ?? { committed: ZERO, paid: ZERO }
    pools.set(key, { committed: addMoney(pool.committed, line.egcs_fc_commitmentamount),
      paid: addMoney(pool.paid, sumMoney([line.egcs_fc_originalpaid, line.egcs_fc_priorcorrections])) })
  }
  // Include incoming JV coding exactly once, even when its source row has different coding.
  const vouchers = await db.selectFrom('Funding_Case_Agreement_Journal_Voucher_Line as line')
    .innerJoin('Funding_Case_Agreement_Journal_Voucher as voucher', 'voucher.id', 'line.egcs_fc_journalvoucher')
    .innerJoin('Funding_Case_Agreement_Payment as payment', 'payment.id', 'voucher.egcs_fc_payment')
    .innerJoin('Transfer_Payment_Stream_Chart_of_Account as coding', 'coding.id', 'line.egcs_fc_chartofaccount')
    .innerJoin('Agency_Chart_of_Account as account', 'account.id', 'coding.egcs_tp_agencychartofaccount')
    .select(['voucher.id', 'coding.egcs_tp_agencychartofaccount as codingId', databaseMoneyText(sql.ref('line.egcs_fc_amount')).as('amount')])
    .where('voucher.egcs_fc_fundingagreement', '=', agreementId).where('line.egcs_fc_kind', '=', 'adjustment')
    .whereRef('account.egcs_ay_currency', '=', 'voucher.egcs_fc_currency')
    .where(agreementPaymentIsFinal('payment', { requireResolvedApproval: true }))
    .where('voucher._deleted', '=', false).where('line._deleted', '=', false).execute()
  for (const id of new Set(vouchers.map(row => String(row.id)))) {
    if (!await hasPositiveCompletionTerminus(db, 'fundingcasejournalvoucher', id)) continue
    for (const row of vouchers.filter(item => String(item.id) === id)) {
      const pool = pools.get(String(row.codingId))
      if (pool) pool.paid = addMoney(pool.paid, parseDatabaseMoney(row.amount))
    }
  }
  return pools
}

/** Cash and signed accounting entries by Agency fiscal year and fiscal month, without paid floors. */
export const getAgreementPaidAccountingProjection = async (
  db: Kysely<Database>, agreementId: string,
  options: { excludePaymentId?: string; paymentMode?: 'reserved' | 'finalized'; currency?: string } = {}
) => {
  const currency = CURRENCY_CODES_ENUM.find(code => code === options.currency)
  if (options.currency !== undefined && !currency) throw new Error('Accounting currency must be a supported lowercase code')
  let paymentsQuery = db.selectFrom('Funding_Case_Agreement_Payment as payment')
    .innerJoin('Funding_Case_Agreement_Budget_Fiscal_Year as budgetYear', 'budgetYear.id', 'payment.egcs_fc_fiscalyear')
    .innerJoin('Agency_Fiscal_Year as agencyYear', 'agencyYear.id', 'budgetYear.egcs_fc_fiscalyear')
    .select(['payment.id', 'payment.egcs_fc_currency as currency', 'payment.egcs_fc_periodend as month',
      'agencyYear.id as agencyFiscalYearId', 'agencyYear.egcs_ay_fiscalyear as fiscalYearOrder',
      'agencyYear.egcs_ay_fiscalyeardisplay as fiscalYearLabel',
      sql<string>`COALESCE("budgetYear".egcs_fc_originalbudgetfiscalyear, "budgetYear".id)::text`.as('fiscalYearId'),
      databaseMoneyText(sql.ref('payment.egcs_fc_paymentamount')).as('amount')])
    .where('payment.egcs_fc_fundingagreement', '=', agreementId).where('budgetYear.egcs_fc_fundingagreement', '=', agreementId)
    .where('payment._deleted', '=', false)
    .where(agreementPaymentApprovalIsEligible('payment'))
  if (options.excludePaymentId) paymentsQuery = paymentsQuery.where('payment.id', '!=', options.excludePaymentId)
  if (currency) paymentsQuery = paymentsQuery.where('payment.egcs_fc_currency', '=', currency)
  if (options.paymentMode === 'finalized') paymentsQuery = paymentsQuery.where(agreementPaymentIsFinal('payment', { requireResolvedApproval: true }))
  else paymentsQuery = paymentsQuery.where(sql<boolean>`NOT EXISTS (
    SELECT 1 FROM "Common_Completion" completion
    JOIN "Common_Workflow_Run" workflow ON workflow.egcs_cn_completion = completion.id
    JOIN "Common_Runtime" runtime ON runtime.id = workflow.id AND NOT runtime._deleted
    WHERE completion.egcs_cn_entitytype = 'fundingcasepayment' AND completion.egcs_cn_entityid = payment.id AND NOT completion._deleted
      AND runtime.egcs_cn_attempt = (SELECT MAX(latest.egcs_cn_attempt) FROM "Common_Workflow_Run" latest_run
        JOIN "Common_Runtime" latest ON latest.id = latest_run.id WHERE latest_run.egcs_cn_completion = completion.id AND NOT latest._deleted)
      AND runtime.egcs_cn_state IN ('denied','unsuccessful','failed','cancelled')
  )`)
  const payments = await paymentsQuery.execute()
  const years = await db.selectFrom('Funding_Case_Agreement_Budget_Fiscal_Year as budgetYear')
    .innerJoin('Agency_Fiscal_Year as agencyYear', 'agencyYear.id', 'budgetYear.egcs_fc_fiscalyear')
    .select(['agencyYear.id as agencyFiscalYearId', 'agencyYear.egcs_ay_fiscalyear as fiscalYearOrder',
      'agencyYear.egcs_ay_fiscalyeardisplay as fiscalYearLabel',
      sql<string>`COALESCE("budgetYear".egcs_fc_originalbudgetfiscalyear, "budgetYear".id)::text`.as('fiscalYearId')])
    .where('budgetYear.egcs_fc_fundingagreement', '=', agreementId).orderBy('budgetYear.id').execute()
  const entries: Array<{ id: string; kind: 'cash_payment' | 'journal_voucher' | 'correction';
    agencyFiscalYearId: string; fiscalYearId: string; fiscalYearOrder: string; fiscalYearLabel: string;
    month: number; currency: Database['Funding_Case_Agreement_Payment']['egcs_fc_currency']; amount: Money }> = payments.map(row => ({
    ...row, id: String(row.id), kind: 'cash_payment', amount: parseDatabaseMoney(row.amount),
    agencyFiscalYearId: String(row.agencyFiscalYearId), fiscalYearOrder: String(row.fiscalYearOrder), fiscalYearId: String(row.fiscalYearId) }))
  for (const row of await readEffectiveCorrectionAdjustments(db, agreementId, { currency })) {
    const year = years.find(candidate => String(candidate.agencyFiscalYearId) === String(row.agencyFiscalYearId))
    if (!year) throw new Error('Posted Correction fiscal year has no owning Agreement lineage')
    const date = new Date(row.accountingDate)
    entries.push({ id: String(row.correctionId), kind: 'correction', ...year,
      agencyFiscalYearId: String(year.agencyFiscalYearId), fiscalYearId: String(year.fiscalYearId), fiscalYearOrder: String(year.fiscalYearOrder),
      month: (date.getUTCMonth() + 9) % 12, currency: row.currency, amount: row.amount })
  }
  if (!await hasAccountingTable(db, 'Funding_Case_Agreement_Journal_Voucher')) return { agreementId, entries }
  let vouchersQuery = db.selectFrom('Funding_Case_Agreement_Journal_Voucher as voucher')
    .innerJoin('Funding_Case_Agreement_Journal_Voucher_Line as line', 'line.egcs_fc_journalvoucher', 'voucher.id')
    .innerJoin('Funding_Case_Agreement_Payment as payment', 'payment.id', 'voucher.egcs_fc_payment')
    .select(['voucher.id', 'voucher.egcs_fc_payment', 'voucher.egcs_fc_agencyfiscalyear', 'voucher.egcs_fc_currency',
      'voucher.egcs_fc_requesteddate', databaseMoneyText(sql.ref('line.egcs_fc_amount')).as('amount')])
    .where('voucher.egcs_fc_fundingagreement', '=', agreementId).where('line.egcs_fc_kind', '=', 'adjustment')
    .where(agreementPaymentIsFinal('payment', { requireResolvedApproval: true }))
    .where('voucher._deleted', '=', false).where('line._deleted', '=', false)
  if (currency) vouchersQuery = vouchersQuery.where('voucher.egcs_fc_currency', '=', currency)
  const vouchers = await vouchersQuery.execute()
  for (const id of new Set(vouchers.map(row => String(row.id)))) {
    if (!await hasPositiveCompletionTerminus(db, 'fundingcasejournalvoucher', id)) continue
    for (const row of vouchers.filter(candidate => String(candidate.id) === id && String(candidate.egcs_fc_payment) !== options.excludePaymentId)) {
      const year = years.find(candidate => String(candidate.agencyFiscalYearId) === String(row.egcs_fc_agencyfiscalyear))
      if (!year) throw new Error('Successful JV fiscal year has no owning Agreement lineage')
      entries.push({ id, kind: 'journal_voucher', ...year, agencyFiscalYearId: String(year.agencyFiscalYearId),
        fiscalYearId: String(year.fiscalYearId), fiscalYearOrder: String(year.fiscalYearOrder),
        month: (new Date(row.egcs_fc_requesteddate).getUTCMonth() + 9) % 12, currency: row.egcs_fc_currency,
        amount: parseDatabaseMoney(row.amount) })
    }
  }
  return { agreementId, entries }
}

/** Document totals retain currency boundaries instead of adding unrelated units. */
export const summarizePaidAccountingByCurrency = (entries: Awaited<ReturnType<typeof getAgreementPaidAccountingProjection>>['entries']) =>
  [...new Set(entries.map(entry => entry.currency))].map(currency => {
    const selected = entries.filter(entry => entry.currency === currency)
    return { currency, cashPaid: sumMoney(selected.filter(entry => entry.kind === 'cash_payment').map(entry => entry.amount)),
      jvEffects: sumMoney(selected.filter(entry => entry.kind === 'journal_voucher').map(entry => entry.amount)),
      correctionAdjustments: sumMoney(selected.filter(entry => entry.kind === 'correction').map(entry => entry.amount)),
      correctedRecordedPaid: sumMoney(selected.map(entry => entry.amount)) }
  })

/** Cumulative recorded paid totals through a stable selected fiscal year and period. */
export const getAgreementRecordedPaidToDate = async (
  db: Kysely<Database>, agreementId: string,
  input: { fiscalYearId: string; periodEnd: number; excludePaymentId?: string; currency?: string }
) => {
  if (!Number.isInteger(input.periodEnd) || input.periodEnd < 0 || input.periodEnd > 11) throw new Error('Invalid fiscal period')
  const year = await db.selectFrom('Funding_Case_Agreement_Budget_Fiscal_Year as budgetYear')
    .innerJoin('Agency_Fiscal_Year as agencyYear', 'agencyYear.id', 'budgetYear.egcs_fc_fiscalyear')
    .select('agencyYear.egcs_ay_fiscalyear as yearOrder').where('budgetYear.egcs_fc_fundingagreement', '=', agreementId)
    .where(sql<string>`COALESCE("budgetYear".egcs_fc_originalbudgetfiscalyear,"budgetYear".id)::text`, '=', input.fiscalYearId).executeTakeFirst()
  if (!year) throw new Error('The selected fiscal year must belong to the bound Agreement')
  const projection = await getAgreementPaidAccountingProjection(db, agreementId, input)
  const selected = projection.entries.filter(row => BigInt(row.fiscalYearOrder) < BigInt(year.yearOrder)
    || (String(row.fiscalYearOrder) === String(year.yearOrder) && row.month <= input.periodEnd))
  const currencies = new Set(selected.map(row => row.currency))
  if (currencies.size > 1) throw new Error('Recorded paid currency is ambiguous')
  return { agreementId, cashPaidAmount: sumMoney(selected.filter(row => row.kind === 'cash_payment').map(row => row.amount)),
    jvEffectAmount: sumMoney(selected.filter(row => row.kind === 'journal_voucher').map(row => row.amount)),
    correctionAmount: sumMoney(selected.filter(row => row.kind === 'correction').map(row => row.amount)),
    recordedPaidAmount: sumMoney(selected.map(row => row.amount)), currency: input.currency ?? selected[0]?.currency ?? null }
}
