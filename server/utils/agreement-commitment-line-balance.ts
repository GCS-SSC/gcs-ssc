import type { Kysely, Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { resolveLatestTargetApprovalEvidence } from './business-approval-evidence'
import { hasPositiveCompletionTerminus } from './completion-terminus'
import { databaseMoneyText, parseDatabaseMoney } from './database-money'
import { addMoney, compareMoney, subtractMoney, sumMoney, parseMoney, type Money } from '~~/shared/utils/money'
import { sql } from 'kysely'
import { budgetFiscalYearStableId } from './agreement-budget-lineage'
import { readEffectiveCorrectionAdjustments } from './agreement-accounting-projection'

type DbClient = Kysely<Database> | Transaction<Database>
const ZERO_MONEY = parseMoney('0.00')

/**
 * Returns the paid floor for an exact commitment line after successful JV adjustments.
 *
 * Direct Payment coverage stays attached to its exact line. Signed adjustments
 * match the Agency Chart of Account foreign key, within the owning Agreement.
 * Incoming adjustments share the capacity of matching commitment rows rather
 * than being arbitrarily assigned to a row or counted once for every duplicate.
 *
 * @param db - Active database client or transaction.
 * @param commitmentLineId - Exact commitment line identity.
 * @param options - Optional query exclusions.
 * @param options.excludePaymentLineId - Payment line omitted during a patch calculation.
 * @param options.excludePaymentId - Payment omitted while recalculating its allocation.
 * @returns Counted paid amount and whether any active payment line is attached.
 */
export const getCommitmentLinePaymentCoverage = async (
  db: DbClient,
  commitmentLineId: string,
  options: { excludePaymentLineId?: string; excludePaymentId?: string } = {}
) => {
  let query = db
    .selectFrom('Funding_Case_Agreement_Payment_Line')
    .innerJoin(
      'Funding_Case_Agreement_Payment',
      'Funding_Case_Agreement_Payment.id',
      'Funding_Case_Agreement_Payment_Line.egcs_fc_fundingagreementpayment'
    )
    .select([
      'Funding_Case_Agreement_Payment.id as paymentId',
      databaseMoneyText(sql.ref('Funding_Case_Agreement_Payment_Line.egcs_fc_amount')).as('amount')
    ])
    .where('Funding_Case_Agreement_Payment_Line.egcs_fc_fundingagreementcommitmentline', '=', commitmentLineId)
    .where('Funding_Case_Agreement_Payment_Line._deleted', '=', false)
    .where('Funding_Case_Agreement_Payment._deleted', '=', false)

  if (options.excludePaymentLineId) {
    query = query.where('Funding_Case_Agreement_Payment_Line.id', '!=', options.excludePaymentLineId)
  }

  if (options.excludePaymentId) query = query.where('Funding_Case_Agreement_Payment.id', '!=', options.excludePaymentId)
  const rows = await query.execute()
  const approvalByPayment = new Map<string, Awaited<ReturnType<typeof resolveLatestTargetApprovalEvidence>>>()
  for (const paymentId of new Set(rows.map(row => String(row.paymentId)))) {
    approvalByPayment.set(paymentId, await resolveLatestTargetApprovalEvidence(db, 'fundingcasepayment', paymentId))
  }

  const paidAmount = sumMoney(rows.flatMap((row): Money[] =>
    approvalByPayment.get(String(row.paymentId))?.approvalRuntimeState === 'denied'
      ? []
      : [parseDatabaseMoney(row.amount)]))
  const originalCoverage = { hasActivePaymentLine: rows.length > 0, paidAmount }
  const line = await db.selectFrom('Funding_Case_Agreement_Commitment_Line as line')
    .innerJoin('Transfer_Payment_Stream_Chart_of_Account as coding', 'coding.id', 'line.egcs_fc_transferpaymentstreamchartofaccount')
    .select(['line.egcs_fc_fundingagreement', 'coding.egcs_tp_agencychartofaccount',
      databaseMoneyText(sql.ref('line.egcs_fc_amount')).as('amount')])
    .where('line.id', '=', commitmentLineId).where('line._deleted', '=', false).executeTakeFirst()
  if (!line) return originalCoverage

  const coding = await readCommitmentCodingCapacity(db, String(line.egcs_fc_fundingagreement),
    String(line.egcs_tp_agencychartofaccount), { ...options, includeCommitmentLineId: commitmentLineId }, approvalByPayment)
  if (!coding) return originalCoverage
  const ownPaid = addMoney(paidAmount, sumMoney(coding.adjustments.filter(row => String(row.commitmentLineId) === commitmentLineId)
    .map(row => parseDatabaseMoney(row.amount))))
  const codingPaidFloor = subtractMoney(parseDatabaseMoney(line.amount), coding.available)
  return {
    hasActivePaymentLine: rows.length > 0 || coding.adjustments.length > 0,
    paidAmount: compareMoney(ownPaid, codingPaidFloor) >= 0 ? ownPaid : codingPaidFloor
  }
}

type CoverageOptions = { excludePaymentLineId?: string; excludePaymentId?: string; includeCommitmentLineId?: string }
type ApprovalEvidence = Awaited<ReturnType<typeof resolveLatestTargetApprovalEvidence>>

/**
 * Reads signed, successful corrections and the capacity shared by one Agency coding key.
 * @param db - Active database or transaction.
 * @param agreementId - Owning Agreement identity.
 * @param agencyChartId - Matching Agency chart foreign key.
 * @param options - Excluded Payment or Payment line for an edit calculation.
 * @param approvalByPayment - Shared cache of the canonical Payment approval evidence.
 * @returns Shared capacity and signed adjustments, or null without successful corrections.
 */
const readCommitmentCodingCapacity = async (
  db: DbClient,
  agreementId: string,
  agencyChartId: string,
  options: CoverageOptions,
  approvalByPayment: Map<string, ApprovalEvidence>
) => {
  const adjustmentRows = await db.selectFrom('Funding_Case_Agreement_Journal_Voucher_Line as adjustment')
    .innerJoin('Funding_Case_Agreement_Journal_Voucher as voucher', 'voucher.id', 'adjustment.egcs_fc_journalvoucher')
    .innerJoin('Funding_Case_Agreement_Payment as payment', 'payment.id', 'voucher.egcs_fc_payment')
    .innerJoin('Transfer_Payment_Stream_Chart_of_Account as coding', 'coding.id', 'adjustment.egcs_fc_chartofaccount')
    .select(['voucher.id as voucherId', 'payment.id as paymentId', 'adjustment.egcs_fc_commitmentline as commitmentLineId',
      databaseMoneyText(sql.ref('adjustment.egcs_fc_amount')).as('amount')])
    .where('voucher.egcs_fc_fundingagreement', '=', agreementId)
    .where('coding.egcs_tp_agencychartofaccount', '=', agencyChartId)
    .where('adjustment.egcs_fc_kind', '=', 'adjustment')
    .where('adjustment._deleted', '=', false).where('voucher._deleted', '=', false).where('payment._deleted', '=', false).execute()
  const successfulVouchers = new Set<string>()
  for (const voucherId of new Set(adjustmentRows.map(row => String(row.voucherId)))) {
    if (await hasPositiveCompletionTerminus(db, 'fundingcasejournalvoucher', voucherId)) successfulVouchers.add(voucherId)
  }
  const postedCorrections = (await readEffectiveCorrectionAdjustments(db, agreementId))
    .filter(row => String(row.agencyChartId) === agencyChartId)
    .map(row => ({ commitmentLineId: row.commitmentLineId, amount: row.amount, paymentId: null }))
  const adjustments = [...adjustmentRows.filter(row => successfulVouchers.has(String(row.voucherId)) && String(row.paymentId) !== options.excludePaymentId), ...postedCorrections]
  if (!adjustments.length) return null

  const codingLines = await db.selectFrom('Funding_Case_Agreement_Commitment_Line as line')
    .innerJoin('Funding_Case_Agreement_Commitment as commitment', 'commitment.id', 'line.egcs_fc_commitment')
    .innerJoin('Transfer_Payment_Stream_Chart_of_Account as coding', 'coding.id', 'line.egcs_fc_transferpaymentstreamchartofaccount')
    .select(['line.id', databaseMoneyText(sql.ref('line.egcs_fc_amount')).as('amount')])
    .where('commitment.egcs_fc_fundingagreement', '=', agreementId)
    .where('coding.egcs_tp_agencychartofaccount', '=', agencyChartId)
    .where('commitment._deleted', '=', false).where('line._deleted', '=', false)
    .where(eb => options.includeCommitmentLineId
      ? eb.or([eb('commitment.egcs_fc_active', '=', true), eb('line.id', '=', options.includeCommitmentLineId)])
      : eb('commitment.egcs_fc_active', '=', true)).execute()
  let codingPaymentsQuery = db.selectFrom('Funding_Case_Agreement_Payment_Line as paymentLine')
    .innerJoin('Funding_Case_Agreement_Payment as payment', 'payment.id', 'paymentLine.egcs_fc_fundingagreementpayment')
    .select(['payment.id as paymentId', databaseMoneyText(sql.ref('paymentLine.egcs_fc_amount')).as('amount')])
    .where('paymentLine.egcs_fc_fundingagreementcommitmentline', 'in', codingLines.map(row => String(row.id)))
    .where('paymentLine._deleted', '=', false).where('payment._deleted', '=', false)
  if (options.excludePaymentId) codingPaymentsQuery = codingPaymentsQuery.where('payment.id', '!=', options.excludePaymentId)
  if (options.excludePaymentLineId) codingPaymentsQuery = codingPaymentsQuery.where('paymentLine.id', '!=', options.excludePaymentLineId)
  const codingPayments = await codingPaymentsQuery.execute()
  for (const paymentId of new Set([...codingPayments, ...adjustments].flatMap(row => row.paymentId === null ? [] : [String(row.paymentId)]))) {
    if (!approvalByPayment.has(paymentId)) {
      approvalByPayment.set(paymentId, await resolveLatestTargetApprovalEvidence(db, 'fundingcasepayment', paymentId))
    }
  }
  const counted = (paymentId: string | null) => paymentId === null || approvalByPayment.get(String(paymentId))?.approvalRuntimeState !== 'denied'
  const countedAdjustments = adjustments.filter(row => counted(row.paymentId))
  const codingPaid = sumMoney([...codingPayments.filter(row => counted(row.paymentId)), ...countedAdjustments]
    .map(row => parseDatabaseMoney(row.amount)))
  return {
    adjustments: countedAdjustments,
    available: subtractMoney(sumMoney(codingLines.map(row => parseDatabaseMoney(row.amount))), codingPaid)
  }
}

/** Selection for the host-owned payment-capacity projection. Fiscal year is the stable Agreement budget-year ID. */
export interface AgreementCommitmentPaymentCapacityInput {
  fiscalYearId: string
  commitmentTypeId: string
  excludePaymentId?: string
}

/**
 * Returns aggregate payable capacity for active commitments in an Agreement fiscal year and type.
 * Direct allocations retain exact-line coverage; successful JV adjustments share the Agency-code pool.
 * Multiple selected rows with the same coding consume that shared pool only once.
 * The caller supplies its active transaction; this projection neither writes nor establishes posting.
 * @param db - Active database or transaction.
 * @param agreementId - Owning Agreement identity.
 * @param input - Stable fiscal year, commitment type and optional Payment exclusion.
 * @returns Exact, nonnegative aggregate capacity as canonical Money.
 */
export const getAgreementCommitmentPaymentCapacity = async (
  db: DbClient,
  agreementId: string,
  input: AgreementCommitmentPaymentCapacityInput
): Promise<Money> => {
  const lines = await db.selectFrom('Funding_Case_Agreement_Commitment_Line as selectedLine')
    .innerJoin('Funding_Case_Agreement_Commitment as commitment', 'commitment.id', 'selectedLine.egcs_fc_commitment')
    .innerJoin('Transfer_Payment_Stream_Chart_of_Account as coding', 'coding.id', 'selectedLine.egcs_fc_transferpaymentstreamchartofaccount')
    .innerJoin('Agency_Chart_of_Account as account', 'account.id', 'coding.egcs_tp_agencychartofaccount')
    .innerJoin('Funding_Case_Agreement_Budget_Fiscal_Year',
      'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fiscalyear', 'account.egcs_ay_fiscalyear')
    .innerJoin('Funding_Case_Agreement_Budget_Version', 'Funding_Case_Agreement_Budget_Version.id',
      'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_budgetversion')
    .select(['selectedLine.id', 'account.id as agencyChartId',
      databaseMoneyText(sql.ref('selectedLine.egcs_fc_amount')).as('amount')])
    .where('commitment.egcs_fc_fundingagreement', '=', agreementId)
    .where('Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fundingagreement', '=', agreementId)
    .where('commitment.egcs_fc_type', '=', input.commitmentTypeId)
    .where('commitment.egcs_fc_active', '=', true)
    .where(budgetFiscalYearStableId, '=', input.fiscalYearId)
    .where('commitment._deleted', '=', false).where('selectedLine._deleted', '=', false)
    .where('Funding_Case_Agreement_Budget_Fiscal_Year._deleted', '=', false)
    .where('Funding_Case_Agreement_Budget_Version.egcs_fc_iscurrent', '=', true)
    .where('Funding_Case_Agreement_Budget_Version._deleted', '=', false).execute()
  if (!lines.length) return ZERO_MONEY
  let query = db.selectFrom('Funding_Case_Agreement_Payment_Line as selectedPaymentLine')
    .innerJoin('Funding_Case_Agreement_Payment as payment', 'payment.id', 'selectedPaymentLine.egcs_fc_fundingagreementpayment')
    .select(['payment.id as paymentId', 'selectedPaymentLine.egcs_fc_fundingagreementcommitmentline as commitmentLineId',
      databaseMoneyText(sql.ref('selectedPaymentLine.egcs_fc_amount')).as('amount')])
    .where('selectedPaymentLine.egcs_fc_fundingagreementcommitmentline', 'in', lines.map(row => String(row.id)))
    .where('selectedPaymentLine._deleted', '=', false).where('payment._deleted', '=', false)
  if (input.excludePaymentId) query = query.where('payment.id', '!=', input.excludePaymentId)
  const payments = await query.execute()
  const approvalByPayment = new Map<string, ApprovalEvidence>()
  for (const paymentId of new Set(payments.map(row => String(row.paymentId)))) {
    approvalByPayment.set(paymentId, await resolveLatestTargetApprovalEvidence(db, 'fundingcasepayment', paymentId))
  }
  const available: Money[] = []
  for (const agencyChartId of new Set(lines.map(row => String(row.agencyChartId)))) {
    const selected = lines.filter(row => String(row.agencyChartId) === agencyChartId)
    const lineIds = new Set(selected.map(row => String(row.id)))
    const directPaid = sumMoney(payments.filter(row => lineIds.has(String(row.commitmentLineId))
      && approvalByPayment.get(String(row.paymentId))?.approvalRuntimeState !== 'denied').map(row => parseDatabaseMoney(row.amount)))
    const coding = await readCommitmentCodingCapacity(db, agreementId, agencyChartId, input, approvalByPayment)
    const selectedPaid = addMoney(directPaid, sumMoney(coding?.adjustments.filter(row => lineIds.has(String(row.commitmentLineId)))
      .map(row => parseDatabaseMoney(row.amount)) ?? []))
    const ownAvailable = subtractMoney(sumMoney(selected.map(row => parseDatabaseMoney(row.amount))), selectedPaid)
    const remaining = coding && compareMoney(coding.available, ownAvailable) < 0 ? coding.available : ownAvailable
    available.push(compareMoney(remaining, ZERO_MONEY) < 0 ? ZERO_MONEY : remaining)
  }
  return sumMoney(available)
}

/**
 * Validates generated allocations together, preventing duplicate rows from spending a coding pool twice.
 * @param db - Caller-owned active transaction.
 * @param agreementId - Bound Agreement.
 * @param allocations - Proposed exact-line monetary amounts.
 * @param options - Same-Agreement Payment excluded when recalculating its lines.
 * @param options.excludePaymentId - Payment omitted while recalculating its allocation.
 * @returns Whether every exact row and shared Agency coding pool covers the proposed allocation.
 */
export const validateAgreementPaymentAllocations = async (
  db: DbClient,
  agreementId: string,
  allocations: Array<{ commitmentLineId: string; amount: string }>,
  options: { excludePaymentId?: string } = {}
): Promise<boolean> => {
  const totals = new Map<string, Money>()
  for (const row of allocations) {
    const amount = parseMoney(row.amount)
    if (compareMoney(amount, ZERO_MONEY) < 0) return false
    totals.set(row.commitmentLineId, addMoney(totals.get(row.commitmentLineId) ?? ZERO_MONEY, amount))
  }
  const codingTotals = new Map<string, Money>()
  for (const [lineId, proposed] of totals) {
    const line = await db.selectFrom('Funding_Case_Agreement_Commitment_Line as proposedLine')
      .innerJoin('Transfer_Payment_Stream_Chart_of_Account as coding', 'coding.id', 'proposedLine.egcs_fc_transferpaymentstreamchartofaccount')
      .select(['coding.egcs_tp_agencychartofaccount', databaseMoneyText(sql.ref('proposedLine.egcs_fc_amount')).as('amount')])
      .where('proposedLine.id', '=', lineId).where('proposedLine.egcs_fc_fundingagreement', '=', agreementId)
      .where('proposedLine._deleted', '=', false).executeTakeFirst()
    if (!line) return false
    const coverage = await getCommitmentLinePaymentCoverage(db, lineId, options)
    if (compareMoney(proposed, subtractMoney(parseDatabaseMoney(line.amount), coverage.paidAmount)) > 0) return false
    const codingId = String(line.egcs_tp_agencychartofaccount)
    codingTotals.set(codingId, addMoney(codingTotals.get(codingId) ?? ZERO_MONEY, proposed))
  }
  for (const [codingId, proposed] of codingTotals) {
    const coding = await readCommitmentCodingCapacity(db, agreementId, codingId, options, new Map())
    if (coding && compareMoney(proposed, coding.available) > 0) return false
  }
  return true
}
