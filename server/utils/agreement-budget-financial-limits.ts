/* eslint-disable jsdoc/require-jsdoc */
import { sql, type Kysely, type Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { moneyToCents, type Money } from '~~/shared/utils/money'
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
  maxPerProponent: Money
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

const ratioHundredths = (ratio: string): bigint => {
  const match = /^(0|1)(?:\.(\d{1,2}))?$/.exec(ratio)
  if (!match?.[1]) throw new TypeError('Financial limit ratio must be between zero and one with at most two decimal places.')
  const scaled = BigInt(match[1]) * BigInt(100) + BigInt((match[2] ?? '').padEnd(2, '0'))
  if (scaled > BigInt(100)) throw new RangeError('Financial limit ratio exceeds one.')
  return scaled
}

export const findAgreementBudgetFinancialLimitViolation = (
  limits: BudgetFinancialLimits,
  lines: BudgetFinancialLimitLine[]
): AgreementBudgetFinancialLimitViolation | null => {
  const supportRatio = ratioHundredths(limits.supportRatio)
  const stackingRatio = ratioHundredths(limits.stackingRatio)
  const maxPerProponent = moneyToCents(limits.maxPerProponent)
  const perProponent = new Map<string, bigint>()
  let stacking = BigInt(0)
  let totalCost = BigInt(0)
  for (const line of lines) {
    const program = moneyToCents(line.programFunding)
    const costSharing = line.costSharingFunding.reduce((sum, amount) => sum + moneyToCents(amount), BigInt(0))
    if (program * BigInt(100) > (program + costSharing) * supportRatio) return { kind: 'support', lineId: line.id }
    const proponentFunding = (perProponent.get(line.proponentId) ?? BigInt(0)) + program
    perProponent.set(line.proponentId, proponentFunding)
    if (proponentFunding > maxPerProponent) return { kind: 'proponent', proponentId: line.proponentId, lineId: line.id }
    stacking += program + line.stackingFunding.reduce((sum, amount) => sum + moneyToCents(amount), BigInt(0))
    totalCost += moneyToCents(line.totalAmount)
  }
  return stacking * BigInt(100) > totalCost * stackingRatio ? { kind: 'stacking' } : null
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
    .select(['line.id', 'line.egcs_fc_applicantrecipient as proponentId',
      databaseMoneyText(sql.ref('line.egcs_fc_totalamount')).as('totalAmount'),
      databaseMoneyText(sql.ref('line.egcs_fc_programfunding')).as('programFunding')])
    .where('line.egcs_fc_fundingagreement', '=', agreementId)
    .where('line.egcs_fc_budgetversion', '=', versionId)
    .where('year.egcs_fc_budgetversion', '=', versionId)
    .where('line._deleted', '=', false).where('year._deleted', '=', false)
    .orderBy('line.id').execute()
  const funding = budgetFundingSourcesByLine(await loadBudgetFundingSources(db, rows.map(row => String(row.id))))
  const violation = findAgreementBudgetFinancialLimitViolation({ ...limits, maxPerProponent: parseDatabaseMoney(limits.maxPerProponent) }, rows.map(row => {
    const sources = funding.get(String(row.id)) ?? []
    return {
      ...row,
      totalAmount: parseDatabaseMoney(row.totalAmount),
      programFunding: parseDatabaseMoney(row.programFunding),
      stackingFunding: sources.filter(source => source.funding_type_instacking).map(source => source.egcs_fc_amount),
      costSharingFunding: sources.filter(source => source.funding_type_incostsharing).map(source => source.egcs_fc_amount)
    }
  }))
  if (violation) throw new AgreementBudgetFinancialLimitError(violation)
}
