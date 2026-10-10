import type { Kysely, Transaction } from 'kysely'
import type { Currency_Codes, Database } from '~~/shared/types/database'
import { CURRENCY_CODES_ENUM } from '~~/shared/constants/enums'
import { resolveLatestTargetApprovalEvidence } from './business-approval-evidence'
import { hasPositiveCompletionTerminus } from './completion-terminus'
import { databaseMoneyText, parseDatabaseMoney } from './database-money'
import { addMoney, compareMoney, subtractMoney, sumMoney, parseMoney, type Money } from '~~/shared/utils/money'
import { sql } from 'kysely'
import { budgetFiscalYearStableId } from './agreement-budget-lineage'
import { readEffectiveAccountReceivableRecoveries, readEffectiveCorrectionAdjustments } from './agreement-accounting-projection'

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
 * @param options.currency - Selected Payment currency, which must match the owning Commitment.
 * @returns Counted paid amount and whether any active payment line is attached.
 */
export const getCommitmentLinePaymentCoverage = async (
  db: DbClient,
  commitmentLineId: string,
  options: { excludePaymentLineId?: string; excludePaymentId?: string; currency?: string } = {}
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
  const line = await db.selectFrom('Funding_Case_Agreement_Commitment_Line as line')
    .innerJoin('Funding_Case_Agreement_Commitment as commitment', 'commitment.id', 'line.egcs_fc_commitment')
    .innerJoin('Transfer_Payment_Stream_Chart_of_Account as coding', 'coding.id', 'line.egcs_fc_transferpaymentstreamchartofaccount')
    .select(['line.egcs_fc_fundingagreement', 'coding.egcs_tp_agencychartofaccount', 'commitment.egcs_fc_currency as currency', 'commitment.egcs_fc_type as commitmentTypeId',
      databaseMoneyText(sql.ref('line.egcs_fc_amount')).as('amount')])
    .where('line.id', '=', commitmentLineId).where('line._deleted', '=', false).executeTakeFirst()
  if (line && options.currency !== undefined && options.currency !== line.currency) throw new Error('Commitment line currency must match selected Payment currency')
  if (line) query = query.where('Funding_Case_Agreement_Payment.egcs_fc_currency', '=', line.currency)
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
  if (!line) return originalCoverage

  const coding = await readCommitmentCodingCapacity(db, String(line.egcs_fc_fundingagreement),
    String(line.egcs_tp_agencychartofaccount), { ...options, currency: line.currency, includeCommitmentLineId: commitmentLineId, commitmentTypeId: line.commitmentTypeId }, approvalByPayment)
  const ownPaid = addMoney(paidAmount, sumMoney(coding.adjustments.filter(row => String(row.commitmentLineId) === commitmentLineId)
    .map(row => parseDatabaseMoney(row.amount))))
  const codingPaidFloor = subtractMoney(parseDatabaseMoney(line.amount), coding.available)
  const typedFloor = coding.typedAvailable === null ? ZERO_MONEY : subtractMoney(parseDatabaseMoney(line.amount), coding.typedAvailable)
  const adjustedFloor = [ownPaid, codingPaidFloor, typedFloor].reduce((maximum, floor) => compareMoney(floor, maximum) > 0 ? floor : maximum, ZERO_MONEY)
  return {
    hasActivePaymentLine: rows.length > 0 || coding.adjustments.length > 0,
    paidAmount: compareMoney(adjustedFloor, ZERO_MONEY) < 0 ? ZERO_MONEY : adjustedFloor
  }
}

type CoverageOptions = { excludePaymentLineId?: string; excludePaymentId?: string; includeCommitmentLineId?: string; includeCommitmentLineIds?: string[]; commitmentTypeId?: string; currency: Currency_Codes }
type ApprovalEvidence = Awaited<ReturnType<typeof resolveLatestTargetApprovalEvidence>>

/**
 * Reads signed, successful corrections and the capacity shared by one Agency coding key.
 * @param db - Active database or transaction.
 * @param agreementId - Owning Agreement identity.
 * @param agencyChartId - Matching Agency chart foreign key.
 * @param options - Excluded Payment or Payment line for an edit calculation.
 * @param approvalByPayment - Shared cache of the canonical Payment approval evidence.
 * @returns Shared capacity across historical payments and signed adjustments.
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
    .where('voucher.egcs_fc_currency', '=', options.currency).where('payment.egcs_fc_currency', '=', options.currency)
    .where('coding.egcs_tp_agencychartofaccount', '=', agencyChartId)
    .where('adjustment.egcs_fc_kind', '=', 'adjustment')
    .where('adjustment._deleted', '=', false).where('voucher._deleted', '=', false).where('payment._deleted', '=', false).execute()
  const successfulVouchers = new Set<string>()
  for (const voucherId of new Set(adjustmentRows.map(row => String(row.voucherId)))) {
    if (await hasPositiveCompletionTerminus(db, 'fundingcasejournalvoucher', voucherId)) successfulVouchers.add(voucherId)
  }
  const postedCorrections = (await readEffectiveCorrectionAdjustments(db, agreementId, { currency: options.currency }))
    .filter(row => String(row.agencyChartId) === agencyChartId)
    .map(row => ({ commitmentLineId: row.commitmentLineId, amount: row.amount, paymentId: null }))
  const recoveries = (await readEffectiveAccountReceivableRecoveries(db, agreementId, { currency: options.currency }))
    .filter(row => String(row.agencyChartId) === agencyChartId)
    .map(row => ({ commitmentLineId: row.commitmentLineId, amount: row.amount, paymentId: null }))
  const adjustments = [...adjustmentRows.filter(row => successfulVouchers.has(String(row.voucherId)) && String(row.paymentId) !== options.excludePaymentId), ...postedCorrections, ...recoveries]

  const codingLines = await db.selectFrom('Funding_Case_Agreement_Commitment_Line as line')
    .innerJoin('Funding_Case_Agreement_Commitment as commitment', 'commitment.id', 'line.egcs_fc_commitment')
    .innerJoin('Transfer_Payment_Stream_Chart_of_Account as coding', 'coding.id', 'line.egcs_fc_transferpaymentstreamchartofaccount')
    .select(['line.id', 'commitment.egcs_fc_type as commitmentTypeId', databaseMoneyText(sql.ref('line.egcs_fc_amount')).as('amount')])
    .where('commitment.egcs_fc_fundingagreement', '=', agreementId)
    .where('commitment.egcs_fc_currency', '=', options.currency)
    .where('coding.egcs_tp_agencychartofaccount', '=', agencyChartId)
    .where('commitment._deleted', '=', false).where('line._deleted', '=', false)
    .where(eb => options.includeCommitmentLineIds?.length
      ? eb.or([eb('commitment.egcs_fc_active', '=', true), eb('line.id', 'in', options.includeCommitmentLineIds)])
      : options.includeCommitmentLineId
        ? eb.or([eb('commitment.egcs_fc_active', '=', true), eb('line.id', '=', options.includeCommitmentLineId)])
        : eb('commitment.egcs_fc_active', '=', true)).execute()
  let codingPaymentsQuery = db.selectFrom('Funding_Case_Agreement_Payment_Line as paymentLine')
    .innerJoin('Funding_Case_Agreement_Payment as payment', 'payment.id', 'paymentLine.egcs_fc_fundingagreementpayment')
    .innerJoin('Funding_Case_Agreement_Commitment_Line as paidLine', 'paidLine.id', 'paymentLine.egcs_fc_fundingagreementcommitmentline')
    .innerJoin('Funding_Case_Agreement_Commitment as paidCommitment', 'paidCommitment.id', 'paidLine.egcs_fc_commitment')
    .innerJoin('Transfer_Payment_Stream_Chart_of_Account as paidCoding', 'paidCoding.id', 'paidLine.egcs_fc_transferpaymentstreamchartofaccount')
    .select(['payment.id as paymentId', 'paidCommitment.egcs_fc_type as commitmentTypeId', databaseMoneyText(sql.ref('paymentLine.egcs_fc_amount')).as('amount')])
    .where('paidCommitment.egcs_fc_fundingagreement', '=', agreementId)
    .where('paidCommitment.egcs_fc_currency', '=', options.currency)
    .where('paidCoding.egcs_tp_agencychartofaccount', '=', agencyChartId)
    .where('paidCommitment._deleted', '=', false).where('paidLine._deleted', '=', false)
    .where('payment.egcs_fc_currency', '=', options.currency)
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
  let typedPaid = ZERO_MONEY
  let typedAvailable: Money | null = null
  if (options.commitmentTypeId) {
    const history = await db.selectFrom('Funding_Case_Agreement_Commitment_Line as historicalLine')
      .innerJoin('Funding_Case_Agreement_Commitment as historicalCommitment', 'historicalCommitment.id', 'historicalLine.egcs_fc_commitment')
      .select('historicalLine.id')
      .where('historicalCommitment.egcs_fc_fundingagreement', '=', agreementId)
      .where('historicalCommitment.egcs_fc_currency', '=', options.currency)
      .where('historicalCommitment.egcs_fc_type', '=', options.commitmentTypeId)
      .where('historicalCommitment._deleted', '=', false).where('historicalLine._deleted', '=', false).execute()
    const historyIds = new Set(history.map(line => String(line.id)))
    typedPaid = sumMoney([
      ...codingPayments.filter(row => String(row.commitmentTypeId) === options.commitmentTypeId && counted(row.paymentId)),
      ...countedAdjustments.filter(row => row.commitmentLineId !== null && historyIds.has(String(row.commitmentLineId)))
    ].map(row => parseDatabaseMoney(row.amount)))
    if (compareMoney(typedPaid, ZERO_MONEY) < 0) typedPaid = ZERO_MONEY
    const committed = sumMoney(codingLines.filter(line => String(line.commitmentTypeId) === options.commitmentTypeId).map(line => parseDatabaseMoney(line.amount)))
    typedAvailable = subtractMoney(committed, typedPaid)
  }
  const committed = sumMoney(codingLines.map(row => parseDatabaseMoney(row.amount)))
  const available = subtractMoney(committed, codingPaid)
  return {
    adjustments: countedAdjustments,
    typedPaid,
    typedAvailable,
    available: compareMoney(available, committed) > 0 ? committed : available
  }
}

/**
 * Reads exact-row paid floors and the minimum allocation required by each shared coding pool.
 * Batch reallocations must preserve the shared floor once, including duplicate coding rows.
 * @param db - Active database transaction.
 * @param input - Agreement, currency, and rows whose capacity will be replaced together.
 * @param input.agreementId - Owning Agreement identity.
 * @param input.currency - Commitment currency.
 * @param input.lineIds - Exact current and prior Commitment line identities.
 * @param input.excludePaymentId - Payment omitted while recalculating its coding.
 * @param input.commitmentTypeId - Preserves paid coding across previous versions of this type.
 * @returns Exact-row coverage and aggregate coding floors.
 */
export const getCommitmentAllocationPaidCoverage = async (
  db: DbClient,
  input: { agreementId: string; currency: Currency_Codes; lineIds: string[]; excludePaymentId?: string; commitmentTypeId?: string }
) => {
  const lines = new Map<string, { paidAmount: Money; hasActivePaymentLine: boolean }>()
  const codingFloors = new Map<string, Money>()
  if (!input.lineIds.length) return { lines, codingFloors }
  const selected = await db.selectFrom('Funding_Case_Agreement_Commitment_Line as allocationLine')
    .innerJoin('Funding_Case_Agreement_Commitment as commitment', 'commitment.id', 'allocationLine.egcs_fc_commitment')
    .innerJoin('Transfer_Payment_Stream_Chart_of_Account as coding', 'coding.id', 'allocationLine.egcs_fc_transferpaymentstreamchartofaccount')
    .select(['allocationLine.id', 'allocationLine.egcs_fc_transferpaymentstreamchartofaccount as codingId',
      'coding.egcs_tp_agencychartofaccount as agencyChartId', databaseMoneyText(sql.ref('allocationLine.egcs_fc_amount')).as('amount')])
    .where('allocationLine.id', 'in', input.lineIds).where('allocationLine.egcs_fc_fundingagreement', '=', input.agreementId)
    .where('commitment.egcs_fc_currency', '=', input.currency).where('allocationLine._deleted', '=', false)
    .where('commitment._deleted', '=', false).execute()
  let paymentsQuery = db.selectFrom('Funding_Case_Agreement_Payment_Line as allocationPaymentLine')
    .innerJoin('Funding_Case_Agreement_Payment as payment', 'payment.id', 'allocationPaymentLine.egcs_fc_fundingagreementpayment')
    .select(['payment.id as paymentId', 'allocationPaymentLine.egcs_fc_fundingagreementcommitmentline as commitmentLineId',
      databaseMoneyText(sql.ref('allocationPaymentLine.egcs_fc_amount')).as('amount')])
    .where('allocationPaymentLine.egcs_fc_fundingagreementcommitmentline', 'in', input.lineIds)
    .where('payment.egcs_fc_currency', '=', input.currency).where('allocationPaymentLine._deleted', '=', false)
    .where('payment._deleted', '=', false)
  if (input.excludePaymentId) paymentsQuery = paymentsQuery.where('payment.id', '!=', input.excludePaymentId)
  const payments = await paymentsQuery.execute()
  const approvals = new Map<string, ApprovalEvidence>()
  for (const paymentId of new Set(payments.map(row => String(row.paymentId)))) {
    approvals.set(paymentId, await resolveLatestTargetApprovalEvidence(db, 'fundingcasepayment', paymentId))
  }
  for (const codingId of new Set(selected.map(row => String(row.codingId)))) {
    const members = selected.filter(row => String(row.codingId) === codingId)
    const coding = await readCommitmentCodingCapacity(db, input.agreementId, String(members[0]!.agencyChartId),
      { currency: input.currency, includeCommitmentLineIds: input.lineIds, excludePaymentId: input.excludePaymentId, commitmentTypeId: input.commitmentTypeId }, approvals)
    for (const member of members) {
      const attached = payments.filter(row => String(row.commitmentLineId) === String(member.id))
      const paid = sumMoney(attached.filter(row => approvals.get(String(row.paymentId))?.approvalRuntimeState !== 'denied')
        .map(row => parseDatabaseMoney(row.amount)))
      const adjustments = coding?.adjustments.filter(row => String(row.commitmentLineId) === String(member.id)) ?? []
      const exactPaid = addMoney(paid, sumMoney(adjustments.map(row => parseDatabaseMoney(row.amount))))
      lines.set(String(member.id), { paidAmount: compareMoney(exactPaid, ZERO_MONEY) < 0 ? ZERO_MONEY : exactPaid,
        hasActivePaymentLine: attached.length > 0 || adjustments.length > 0 })
    }
    const exactFloor = sumMoney(members.map(row => lines.get(String(row.id))!.paidAmount))
    const sharedFloor = coding ? subtractMoney(sumMoney(members.map(row => parseDatabaseMoney(row.amount))), coding.available) : ZERO_MONEY
    codingFloors.set(codingId, [sharedFloor, exactFloor, coding?.typedPaid ?? ZERO_MONEY].reduce((maximum, floor) => compareMoney(floor, maximum) > 0 ? floor : maximum, ZERO_MONEY))
  }
  return { lines, codingFloors }
}

/** Selection for the host-owned payment-capacity projection. Fiscal year is the stable Agreement budget-year ID. */
export interface AgreementCommitmentPaymentCapacityInput {
  fiscalYearId: string
  commitmentTypeId: string
  excludePaymentId?: string
  currency?: string
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
  const currency = CURRENCY_CODES_ENUM.find(code => code === input.currency)
  if (input.currency !== undefined && !currency) throw new Error('Commitment capacity currency must be a supported lowercase code')
  let linesQuery = db.selectFrom('Funding_Case_Agreement_Commitment_Line as selectedLine')
    .innerJoin('Funding_Case_Agreement_Commitment as commitment', 'commitment.id', 'selectedLine.egcs_fc_commitment')
    .innerJoin('Transfer_Payment_Stream_Chart_of_Account as coding', 'coding.id', 'selectedLine.egcs_fc_transferpaymentstreamchartofaccount')
    .innerJoin('Agency_Chart_of_Account as account', 'account.id', 'coding.egcs_tp_agencychartofaccount')
    .innerJoin('Funding_Case_Agreement_Budget_Fiscal_Year',
      'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fiscalyear', 'account.egcs_ay_fiscalyear')
    .innerJoin('Funding_Case_Agreement_Budget_Version', 'Funding_Case_Agreement_Budget_Version.id',
      'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_budgetversion')
    .select(['selectedLine.id', 'account.id as agencyChartId', 'commitment.egcs_fc_currency as currency',
      databaseMoneyText(sql.ref('selectedLine.egcs_fc_amount')).as('amount')])
    .where('commitment.egcs_fc_fundingagreement', '=', agreementId)
    .where('Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fundingagreement', '=', agreementId)
    .where('commitment.egcs_fc_type', '=', input.commitmentTypeId)
    .where('commitment.egcs_fc_active', '=', true)
    .where(budgetFiscalYearStableId, '=', input.fiscalYearId)
    .where('commitment._deleted', '=', false).where('selectedLine._deleted', '=', false)
    .where('Funding_Case_Agreement_Budget_Fiscal_Year._deleted', '=', false)
    .where('Funding_Case_Agreement_Budget_Version.egcs_fc_iscurrent', '=', true)
    .where('Funding_Case_Agreement_Budget_Version._deleted', '=', false)
    .whereRef('account.egcs_ay_currency', '=', 'commitment.egcs_fc_currency')
  if (currency) linesQuery = linesQuery.where('commitment.egcs_fc_currency', '=', currency)
  const lines = await linesQuery.execute()
  if (!lines.length) return ZERO_MONEY
  if (new Set(lines.map(row => row.currency)).size > 1) throw new Error('Commitment payment capacity currency is ambiguous')
  const selectedCurrency = lines[0]!.currency
  let query = db.selectFrom('Funding_Case_Agreement_Payment_Line as selectedPaymentLine')
    .innerJoin('Funding_Case_Agreement_Payment as payment', 'payment.id', 'selectedPaymentLine.egcs_fc_fundingagreementpayment')
    .select(['payment.id as paymentId', 'selectedPaymentLine.egcs_fc_fundingagreementcommitmentline as commitmentLineId',
      databaseMoneyText(sql.ref('selectedPaymentLine.egcs_fc_amount')).as('amount')])
    .where('selectedPaymentLine.egcs_fc_fundingagreementcommitmentline', 'in', lines.map(row => String(row.id)))
    .where('payment.egcs_fc_currency', '=', selectedCurrency)
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
    const coding = await readCommitmentCodingCapacity(db, agreementId, agencyChartId, { ...input, currency: selectedCurrency }, approvalByPayment)
    const selectedPaid = addMoney(directPaid, sumMoney(coding?.adjustments.filter(row => lineIds.has(String(row.commitmentLineId)))
      .map(row => parseDatabaseMoney(row.amount)) ?? []))
    const selectedCommitted = sumMoney(selected.map(row => parseDatabaseMoney(row.amount)))
    const effectiveAvailable = subtractMoney(selectedCommitted, selectedPaid)
    const ownAvailable = compareMoney(effectiveAvailable, selectedCommitted) > 0 ? selectedCommitted : effectiveAvailable
    const remaining = [ownAvailable, coding.available, coding.typedAvailable ?? ownAvailable]
      .reduce((minimum, amount) => compareMoney(amount, minimum) < 0 ? amount : minimum, ownAvailable)
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
 * @param options.currency - Selected Payment currency applied to every allocation.
 * @returns Whether every exact row and shared Agency coding pool covers the proposed allocation.
 */
export const validateAgreementPaymentAllocations = async (
  db: DbClient,
  agreementId: string,
  allocations: Array<{ commitmentLineId: string; amount: string }>,
  options: { excludePaymentId?: string; currency?: string } = {}
): Promise<boolean> => {
  const totals = new Map<string, Money>()
  for (const row of allocations) {
    const amount = parseMoney(row.amount)
    if (compareMoney(amount, ZERO_MONEY) < 0) return false
    totals.set(row.commitmentLineId, addMoney(totals.get(row.commitmentLineId) ?? ZERO_MONEY, amount))
  }
  const codingTotals = new Map<string, { amount: Money; currency: Currency_Codes }>()
  const typedTotals = new Map<string, { codingId: string; commitmentTypeId: string; amount: Money; currency: Currency_Codes }>()
  for (const [lineId, proposed] of totals) {
    const line = await db.selectFrom('Funding_Case_Agreement_Commitment_Line as proposedLine')
      .innerJoin('Funding_Case_Agreement_Commitment as commitment', 'commitment.id', 'proposedLine.egcs_fc_commitment')
      .innerJoin('Transfer_Payment_Stream_Chart_of_Account as coding', 'coding.id', 'proposedLine.egcs_fc_transferpaymentstreamchartofaccount')
      .innerJoin('Agency_Chart_of_Account as account', 'account.id', 'coding.egcs_tp_agencychartofaccount')
      .select(['coding.egcs_tp_agencychartofaccount', 'commitment.egcs_fc_currency as currency', 'commitment.egcs_fc_type as commitmentTypeId', databaseMoneyText(sql.ref('proposedLine.egcs_fc_amount')).as('amount')])
      .where('proposedLine.id', '=', lineId).where('proposedLine.egcs_fc_fundingagreement', '=', agreementId)
      .whereRef('account.egcs_ay_currency', '=', 'commitment.egcs_fc_currency')
      .where('proposedLine._deleted', '=', false).executeTakeFirst()
    if (!line) return false
    if (options.currency !== undefined && line.currency !== options.currency) return false
    if ([...codingTotals.values()].some(pool => pool.currency !== line.currency)) return false
    const coverage = await getCommitmentLinePaymentCoverage(db, lineId, options)
    if (compareMoney(proposed, subtractMoney(parseDatabaseMoney(line.amount), coverage.paidAmount)) > 0) return false
    const codingId = String(line.egcs_tp_agencychartofaccount)
    codingTotals.set(codingId, { currency: line.currency, amount: addMoney(codingTotals.get(codingId)?.amount ?? ZERO_MONEY, proposed) })
    if (line.commitmentTypeId !== undefined) {
      const key = `${codingId}:${line.commitmentTypeId}`
      typedTotals.set(key, { codingId, commitmentTypeId: line.commitmentTypeId, currency: line.currency, amount: addMoney(typedTotals.get(key)?.amount ?? ZERO_MONEY, proposed) })
    }
  }
  for (const [codingId, proposed] of codingTotals) {
    const coding = await readCommitmentCodingCapacity(db, agreementId, codingId, { ...options, currency: proposed.currency }, new Map())
    if (coding && compareMoney(proposed.amount, coding.available) > 0) return false
  }
  for (const proposed of typedTotals.values()) {
    const coding = await readCommitmentCodingCapacity(db, agreementId, proposed.codingId, { ...options, currency: proposed.currency, commitmentTypeId: proposed.commitmentTypeId }, new Map())
    if (coding.typedAvailable !== null && compareMoney(proposed.amount, coding.typedAvailable) > 0) return false
  }
  return true
}
