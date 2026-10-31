/* eslint-disable jsdoc/require-jsdoc */
import { sql, type Kysely, type Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { addMoney, compareMoney, compareScaledMoney, parseCurrencyMoney, parseDecimalText, zeroMoney, sumMoney, type Money } from '~~/shared/utils/money'
import { databaseMoneyText, parseDatabaseMoney } from './database-money'
import { budgetFundingSourcesByLine, loadBudgetFundingSources } from './agreement-budget-funding'

type Db = Kysely<Database> | Transaction<Database>

type BudgetFinancialLimitLine = {
  id: string
  proponentId: string
  totalAmount: Money
  programFunding: Money
  stackingFunding: Money[]
  costSharingFunding: Money[]
}

type BudgetFinancialLimits = {
  maxPerProponent: string
  supportRatio: string
  stackingRatio: string
}

export type AgreementBudgetFinancialLimitViolation =
  | { kind: 'proponent', proponentId: string, lineId: string }
  | { kind: 'support', lineId: string }
  | { kind: 'stacking' }

export class AgreementBudgetFinancialLimitError extends Error {
  constructor(public readonly violation: AgreementBudgetFinancialLimitViolation) {
    super(`Agreement budget ${violation.kind} financial limit exceeded.`)
    this.name = 'AgreementBudgetFinancialLimitError'
  }
}

/** A denomination-neutral configured cap cannot be expressed in the Agreement's currency. */
export class AgreementBudgetFinancialLimitConfigurationError extends Error {
  constructor() {
    super('The configured financial limit is not representable in the Agreement currency.')
    this.name = 'AgreementBudgetFinancialLimitConfigurationError'
  }
}

const checkedRatio = (ratio: string) => {
  if (!/^(?:0(?:\.\d{1,2})?|1(?:\.0{1,2})?)$/.test(ratio)) {
    throw new TypeError('Financial limit ratio must be between zero and one with at most two decimal places.')
  }
  return parseDecimalText(ratio)
}

export const findAgreementBudgetFinancialLimitViolation = (
  limits: BudgetFinancialLimits,
  lines: BudgetFinancialLimitLine[],
  currency: string
): AgreementBudgetFinancialLimitViolation | null => {
  const supportRatio = checkedRatio(limits.supportRatio)
  const stackingRatio = checkedRatio(limits.stackingRatio)
  const one = parseDecimalText('1')
  const zero = zeroMoney(currency)
  let maxPerProponent: Money
  try {
    maxPerProponent = parseCurrencyMoney(limits.maxPerProponent, currency)
  } catch {
    throw new AgreementBudgetFinancialLimitConfigurationError()
  }
  const perProponent = new Map<string, Money>()
  let stacking = zero
  let totalCost = zero
  for (const line of lines) {
    const program = line.programFunding
    const costSharing = sumMoney(line.costSharingFunding, currency)
    if (compareScaledMoney(program, one, addMoney(program, costSharing), supportRatio) > 0) return { kind: 'support', lineId: line.id }
    const proponentFunding = addMoney(perProponent.get(line.proponentId) ?? zero, program)
    perProponent.set(line.proponentId, proponentFunding)
    if (compareMoney(proponentFunding, maxPerProponent) > 0) return { kind: 'proponent', proponentId: line.proponentId, lineId: line.id }
    stacking = sumMoney([stacking, program, ...line.stackingFunding], currency)
    totalCost = addMoney(totalCost, line.totalAmount)
  }
  return compareScaledMoney(stacking, one, totalCost, stackingRatio) > 0 ? { kind: 'stacking' } : null
}

/**
 * Validates the complete saved version after proposed and calculated writes.
 * @param db - Owning authorized write transaction.
 * @param target - Exact Agreement, budget version and its Stream.
 * @param target.agreementId - Owning Agreement.
 * @param target.versionId - Complete proposed budget version.
 * @param target.streamId - Current authoritative Stream.
 */
export const assertAgreementBudgetFinancialLimits = async (
  db: Db,
  target: { agreementId: string, versionId: string, streamId: string }
): Promise<void> => {
  const { agreementId, versionId, streamId } = target
  const limits = await db.selectFrom('Transfer_Payment_Financial_Limits')
    .select([
      databaseMoneyText(sql.ref('egcs_tp_maxallowableperrecipient')).as('maxPerProponent'),
      sql<string>`egcs_tp_maxpercentofsupportavailableperrecipient::text`.as('supportRatio'),
      sql<string>`egcs_tp_stackinglimit::text`.as('stackingRatio')
    ])
    .where('egcs_tp_transferpaymentstream', '=', streamId)
    .where('egcs_tp_active', '=', true).where('_deleted', '=', false)
    .executeTakeFirst()
  if (!limits) return
  const rows = await db.selectFrom('Funding_Case_Agreement_Budget_Line_Item as line')
    .innerJoin('Funding_Case_Agreement_Budget_Fiscal_Year as year', 'year.id', 'line.egcs_fc_fundingagreementbudgetfiscalyear')
    .select(['line.id', 'line.egcs_fc_applicantrecipient as proponentId', 'line.egcs_fc_currency as currency',
      databaseMoneyText(sql.ref('line.egcs_fc_totalamount')).as('totalAmount'),
      databaseMoneyText(sql.ref('line.egcs_fc_programfunding')).as('programFunding')])
    .where('line.egcs_fc_fundingagreement', '=', agreementId)
    .where('line.egcs_fc_budgetversion', '=', versionId)
    .where('year.egcs_fc_budgetversion', '=', versionId)
    .where('line._deleted', '=', false).where('year._deleted', '=', false)
    .orderBy('line.id').execute()
  const agreement = await db.selectFrom('Funding_Case_Agreement_Profile').select('egcs_fc_currency')
    .where('id', '=', agreementId).where('_deleted', '=', false).executeTakeFirstOrThrow()
  const funding = budgetFundingSourcesByLine(await loadBudgetFundingSources(db, rows.map(row => String(row.id))))
  const violation = findAgreementBudgetFinancialLimitViolation({ ...limits, maxPerProponent: limits.maxPerProponent }, rows.map(row => {
    const sources = funding.get(String(row.id)) ?? []
    return {
      ...row,
      totalAmount: parseDatabaseMoney(row.totalAmount, row.currency),
      programFunding: parseDatabaseMoney(row.programFunding, row.currency),
      stackingFunding: sources.filter(source => source.funding_type_instacking).map(source => source.egcs_fc_amount),
      costSharingFunding: sources.filter(source => source.funding_type_incostsharing).map(source => source.egcs_fc_amount)
    }
  }), agreement.egcs_fc_currency)
  if (violation) throw new AgreementBudgetFinancialLimitError(violation)
}
