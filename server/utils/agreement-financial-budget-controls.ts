import { sql, type Kysely, type Transaction } from 'kysely'
import type { Currency_Codes, Database, Workflow_Target_Entity_Type } from '~~/shared/types/database'
import type { BusinessRecordStateFields } from '~~/shared/types/business-record-state'
import { compareMoney, sumMoney, parseMoneyText, type Money } from '~~/shared/utils/money'
import { parseDatabaseMoney } from './database-money'
import { getBusinessRecordStateProjections } from './business-record-state'
import { readEffectiveAccountReceivableClaimRecoveries } from './agreement-accounting-projection'

type Db = Kysely<Database> | Transaction<Database>

export type AgreementFinancialBudgetTarget =
  | { kind: 'forecast', id: string, version?: string }
  | { kind: 'claim', id: string }
  | { kind: 'reconciliation', id: string }

export interface AgreementFinancialBudgetViolationDetails {
  kind: AgreementFinancialBudgetTarget['kind']
  fiscalYearId: string
  forecastVersion?: string
  currency: string
  amount: Money
  budget: Money
}

/** Domain failure mapped to a localized response by the owning write handler. */
export class AgreementFinancialBudgetViolation extends Error {
  /**
   * Retains exact program-funding details for the owning response adapter.
   * @param details - Exceeded annual pool.
   */
  constructor(public readonly details: AgreementFinancialBudgetViolationDetails) {
    super('Agreement annual funding budget exceeded.')
    this.name = 'AgreementFinancialBudgetViolation'
  }
}

interface FundingAmountRow {
  documentId: string
  claimId?: string
  amount: string
}

const negativeStates = ['unsuccessful', 'denied', 'cancelled', 'failed']
const ZERO = parseMoneyText('0.00')
/**
 * Ignores target approval evidence superseded by a newer workflow attempt.
 * @param state - Latest Completion, workflow and target approval evidence.
 * @returns Whether the current outcome releases annual capacity.
 */
const hasNegativeBudgetOutcome = (state: BusinessRecordStateFields | undefined): boolean => {
  if (!state) return false
  const approvalIsCurrent = !state.workflowRuntimeId || !state.approvalRuntimeId
    || BigInt(state.approvalRuntimeId) >= BigInt(state.workflowRuntimeId)
  return state.lifecycleTerminus === 'negative'
    || Boolean(state.workflowRuntimeState && negativeStates.includes(state.workflowRuntimeState))
    || Boolean(approvalIsCurrent && state.approvalRuntimeState && negativeStates.includes(state.approvalRuntimeState))
}

/**
 * Includes standard workflow evidence when a Claim failed before Completion.
 * @param db - Current snapshot or transaction.
 * @param entityType - Exact financial entity type.
 * @param ids - Records whose annual capacity participation is being resolved.
 * @returns Latest financial-record outcomes.
 */
const getBudgetRecordStates = async (db: Db, entityType: Workflow_Target_Entity_Type, ids: string[]) => {
  const states = await getBusinessRecordStateProjections(db, entityType, ids)
  if (ids.length === 0) return states
  const workflows = (await sql<{ id: string, runtimeId: string, state: BusinessRecordStateFields['workflowRuntimeState'] }>`
    SELECT DISTINCT ON (egcs_cn_entityid) egcs_cn_entityid::text AS id, runtime.id::text AS "runtimeId", egcs_cn_state AS state
    FROM "Common_Runtime" runtime
    WHERE egcs_cn_kind = 'workflow' AND egcs_cn_entitytype = ${entityType}
      AND egcs_cn_entityid IN (${sql.join([...new Set(ids)].map(id => sql`${id}::bigint`))})
      AND egcs_cn_purpose = 'standard' AND NOT _deleted
    ORDER BY egcs_cn_entityid, runtime.id DESC
  `.execute(db)).rows
  for (const workflow of workflows) {
    const state = states.get(workflow.id)
    if (state && !state.isCompleted) states.set(workflow.id, {
      ...state, workflowRuntimeId: workflow.runtimeId, workflowRuntimeState: workflow.state
    })
  }
  return states
}

/**
 * Checks the saved proposal against the live current annual budget in the same transaction.
 * Agreement writes must already hold the established Agreement lock before calling this helper.
 * @param db - Current request snapshot or locked write transaction.
 * @param agreementId - Owning Agreement.
 * @param target - Proposal; forecast omission selects its highest live authored version.
 * @returns Exceeded annual program funding, otherwise null.
 */
export const getAgreementFinancialBudgetViolation = async (
  db: Db,
  agreementId: string,
  target: AgreementFinancialBudgetTarget
): Promise<AgreementFinancialBudgetViolationDetails | null> => {
  const header = target.kind === 'forecast'
    ? sql`SELECT egcs_fc_fiscalyear AS year_id FROM "Funding_Case_Agreement_Forecast"
        WHERE id = ${target.id}::bigint AND egcs_fc_fundingagreement = ${agreementId}::bigint AND NOT _deleted`
    : target.kind === 'claim'
      ? sql`SELECT egcs_fc_fiscalyear AS year_id FROM "Funding_Case_Agreement_Claim"
          WHERE id = ${target.id}::bigint AND egcs_fc_fundingagreement = ${agreementId}::bigint AND NOT _deleted`
      : sql`SELECT claim.egcs_fc_fiscalyear AS year_id FROM "Funding_Case_Agreement_Claim_Reconcile" reconcile
          JOIN "Funding_Case_Agreement_Claim" claim ON claim.id = reconcile.egcs_fc_fundingagreementclaim
          WHERE reconcile.id = ${target.id}::bigint AND claim.egcs_fc_fundingagreement = ${agreementId}::bigint
            AND NOT reconcile._deleted AND NOT claim._deleted`
  const context = (await sql<{ fiscalYearId: string, currency: Currency_Codes }>`
    SELECT COALESCE(year.egcs_fc_originalbudgetfiscalyear,year.id)::text AS "fiscalYearId",
      profile.egcs_fc_currency AS currency
    FROM (${header}) proposal
    JOIN "Funding_Case_Agreement_Budget_Fiscal_Year" year ON year.id = proposal.year_id
      AND year.egcs_fc_fundingagreement = ${agreementId}::bigint
    JOIN "Funding_Case_Agreement_Profile" profile ON profile.id = year.egcs_fc_fundingagreement
    WHERE NOT profile._deleted
  `.execute(db)).rows[0]
  if (!context) throw new Error('Agreement financial budget proposal is unavailable.')

  const budgetRow = (await sql<{ amount: string }>`
    SELECT COALESCE(SUM(line.egcs_fc_programfunding), 0)::text AS amount
    FROM "Funding_Case_Agreement_Budget_Line_Item" line
    JOIN "Funding_Case_Agreement_Budget_Fiscal_Year" year ON year.id = line.egcs_fc_fundingagreementbudgetfiscalyear
    JOIN "Funding_Case_Agreement_Budget_Version" version ON version.id = year.egcs_fc_budgetversion
    WHERE year.egcs_fc_fundingagreement = ${agreementId}::bigint
      AND line.egcs_fc_fundingagreement = ${agreementId}::bigint
      AND version.egcs_fc_fundingagreement = ${agreementId}::bigint
      AND COALESCE(year.egcs_fc_originalbudgetfiscalyear,year.id) = ${context.fiscalYearId}::bigint
      AND version.egcs_fc_iscurrent AND NOT version._deleted AND NOT year._deleted AND NOT line._deleted
      AND line.egcs_fc_currency = ${context.currency}
  `.execute(db)).rows[0]
  const budget = budgetRow ? parseDatabaseMoney(budgetRow.amount) : ZERO

  let forecastVersion: string | undefined
  let amounts: FundingAmountRow[]
  if (target.kind === 'forecast') {
    forecastVersion = target.version ?? (await sql<{ version: string | null }>`
      SELECT MAX(egcs_fc_version)::text AS version FROM "Funding_Case_Agreement_Forecast_Line_Item"
      WHERE egcs_fc_agreementforecast = ${target.id}::bigint AND NOT _deleted
    `.execute(db)).rows[0]?.version ?? undefined
    amounts = (await sql<FundingAmountRow>`
      SELECT ${target.id}::text AS "documentId", COALESCE(SUM(egcs_fc_amount), 0)::text AS amount
      FROM "Funding_Case_Agreement_Forecast_Line_Item"
      WHERE egcs_fc_agreementforecast = ${target.id}::bigint AND NOT _deleted
        AND egcs_fc_currency = ${context.currency} AND egcs_fc_version = ${forecastVersion ?? '0'}::bigint
    `.execute(db)).rows
  } else {
    const claims = sql`
      SELECT claim.id FROM "Funding_Case_Agreement_Claim" claim
      JOIN "Funding_Case_Agreement_Budget_Fiscal_Year" year ON year.id = claim.egcs_fc_fiscalyear
      WHERE claim.egcs_fc_fundingagreement = ${agreementId}::bigint AND NOT claim._deleted
        AND year.egcs_fc_fundingagreement = ${agreementId}::bigint
        AND COALESCE(year.egcs_fc_originalbudgetfiscalyear,year.id) = ${context.fiscalYearId}::bigint`
    if (target.kind === 'claim') {
      amounts = (await sql<FundingAmountRow>`
        SELECT claim.id::text AS "documentId", SUM(line.egcs_fc_amount)::text AS amount
        FROM "Funding_Case_Agreement_Claim_Line_Item" line JOIN (${claims}) claim
          ON claim.id = line.egcs_fc_fundingagreementclaim
        WHERE NOT line._deleted AND line.egcs_fc_currency = ${context.currency}
        GROUP BY claim.id
      `.execute(db)).rows
    } else {
      amounts = (await sql<FundingAmountRow>`
        SELECT reconcile.id::text AS "documentId", claim.id::text AS "claimId", SUM(line.egcs_fc_reconciled)::text AS amount
        FROM "Funding_Case_Agreement_Claim_Reconcile" reconcile JOIN (${claims}) claim
          ON claim.id = reconcile.egcs_fc_fundingagreementclaim
        JOIN "Funding_Case_Agreement_Claim_Reconcile_Line_Item" line
          ON line.egcs_fc_fundingagreementclaimreconcile = reconcile.id AND NOT line._deleted
        JOIN "Funding_Case_Agreement_Claim_Line_Item" source ON source.id = line.egcs_fc_lineitem
          AND source.egcs_fc_fundingagreementclaim = claim.id AND NOT source._deleted
        WHERE NOT reconcile._deleted AND source.egcs_fc_currency = ${context.currency}
        GROUP BY reconcile.id, claim.id
      `.execute(db)).rows
    }
    const states = await getBudgetRecordStates(db,
      target.kind === 'claim' ? 'fundingcaseagreementclaim' : 'fundingclaimreconcile', amounts.map(row => row.documentId))
    const claimStates = target.kind === 'reconciliation'
      ? await getBudgetRecordStates(db, 'fundingcaseagreementclaim', amounts.flatMap(row => row.claimId ? [row.claimId] : []))
      : null
    amounts = amounts.filter(row => {
      if (row.documentId === target.id) return true
      if (row.claimId && hasNegativeBudgetOutcome(claimStates?.get(row.claimId))) return false
      const state = states.get(row.documentId)
      if (hasNegativeBudgetOutcome(state)) return false
      return target.kind === 'claim' || state?.lifecycleTerminus === 'positive'
    })
  }
  const recoveriesByClaim = new Map<string, Money[]>()
  if (target.kind !== 'forecast' && amounts.length > 0) {
    const recoveries = await readEffectiveAccountReceivableClaimRecoveries(db, agreementId, {
      currency: context.currency, fiscalYearBasis: 'claim-source'
    })
    for (const recovery of recoveries) {
      if (recovery.fiscalYearId !== context.fiscalYearId || compareMoney(recovery.amount, ZERO) >= 0) continue
      const values = recoveriesByClaim.get(recovery.claimId) ?? []
      values.push(recovery.amount)
      recoveriesByClaim.set(recovery.claimId, values)
    }
  }
  const amountsByClaim = new Map<string, Money[]>()
  for (const row of amounts) {
    const claimId = row.claimId ?? row.documentId
    const values = amountsByClaim.get(claimId) ?? []
    values.push(parseDatabaseMoney(row.amount))
    amountsByClaim.set(claimId, values)
  }
  const annualAmounts: Money[] = []
  for (const [claimId, values] of amountsByClaim) {
    let amount = sumMoney(values)
    const recoveries = recoveriesByClaim.get(claimId)
    if (recoveries) {
      amount = sumMoney([amount, ...recoveries])
      if (compareMoney(amount, ZERO) < 0) amount = ZERO
    }
    annualAmounts.push(amount)
  }
  const amount = sumMoney(annualAmounts)
  if (compareMoney(amount, budget) > 0) return {
    kind: target.kind, fiscalYearId: context.fiscalYearId,
    ...(forecastVersion === undefined ? {} : { forecastVersion }),
    currency: context.currency, amount, budget
  }

  return null
}

/**
 * Rejects a saved proposal that exceeds current annual program funding.
 * @param db - Locked Agreement write transaction.
 * @param agreementId - Owning Agreement.
 * @param target - Proposal being saved or completed.
 */
export const assertAgreementFinancialBudgetControls = async (
  db: Db, agreementId: string, target: AgreementFinancialBudgetTarget
): Promise<void> => {
  const violation = await getAgreementFinancialBudgetViolation(db, agreementId, target)
  if (violation) throw new AgreementFinancialBudgetViolation(violation)
}

/**
 * Prevents current-budget edits from reducing annual program funding below counted financial usage.
 * @param db - Transaction already holding the Agreement write lock.
 * @param agreementId - Agreement whose current budget has just changed.
 */
export const assertAgreementCurrentBudgetUsage = async (db: Db, agreementId: string): Promise<void> => {
  const [forecasts, claims, reconciliations] = await Promise.all([
    db.selectFrom('Funding_Case_Agreement_Forecast').select(['id', 'egcs_fc_active'])
      .where('egcs_fc_fundingagreement', '=', agreementId).where('_deleted', '=', false).execute(),
    db.selectFrom('Funding_Case_Agreement_Claim')
      .innerJoin('Funding_Case_Agreement_Budget_Fiscal_Year as sourceYear', join => join
        .onRef('sourceYear.id', '=', 'Funding_Case_Agreement_Claim.egcs_fc_fiscalyear')
        .on('sourceYear.egcs_fc_fundingagreement', '=', agreementId))
      .select(['Funding_Case_Agreement_Claim.id as id',
        sql<string>`COALESCE("sourceYear".egcs_fc_originalbudgetfiscalyear,"sourceYear".id)::text`.as('fiscalYearId')])
      .where('Funding_Case_Agreement_Claim.egcs_fc_fundingagreement', '=', agreementId)
      .where('Funding_Case_Agreement_Claim._deleted', '=', false).execute(),
    db.selectFrom('Funding_Case_Agreement_Claim_Reconcile')
      .innerJoin('Funding_Case_Agreement_Claim', 'Funding_Case_Agreement_Claim.id', 'Funding_Case_Agreement_Claim_Reconcile.egcs_fc_fundingagreementclaim')
      .innerJoin('Funding_Case_Agreement_Budget_Fiscal_Year as sourceYear', join => join
        .onRef('sourceYear.id', '=', 'Funding_Case_Agreement_Claim.egcs_fc_fiscalyear')
        .on('sourceYear.egcs_fc_fundingagreement', '=', agreementId))
      .select(['Funding_Case_Agreement_Claim_Reconcile.id as id', 'Funding_Case_Agreement_Claim.id as claimId',
        sql<string>`COALESCE("sourceYear".egcs_fc_originalbudgetfiscalyear,"sourceYear".id)::text`.as('fiscalYearId')])
      .where('Funding_Case_Agreement_Claim.egcs_fc_fundingagreement', '=', agreementId)
      .where('Funding_Case_Agreement_Claim._deleted', '=', false)
      .where('Funding_Case_Agreement_Claim_Reconcile._deleted', '=', false).execute()
  ])
  const forecastStates = await getBudgetRecordStates(db, 'fundingcaseforecast', forecasts.map(row => String(row.id)))
  const claimStates = await getBudgetRecordStates(db, 'fundingcaseagreementclaim', claims.map(row => String(row.id)))
  const reconcileStates = await getBudgetRecordStates(db, 'fundingclaimreconcile', reconciliations.map(row => String(row.id)))
  for (const forecast of forecasts) {
    const state = forecastStates.get(String(forecast.id))
    if (!forecast.egcs_fc_active && (hasNegativeBudgetOutcome(state) || state?.lifecycleTerminus === 'positive')) continue
    await assertAgreementFinancialBudgetControls(db, agreementId, { kind: 'forecast', id: String(forecast.id) })
  }
  const checkedClaimYears = new Set<string>()
  for (const claim of claims) {
    if (!checkedClaimYears.has(claim.fiscalYearId) && !hasNegativeBudgetOutcome(claimStates.get(String(claim.id)))) {
      await assertAgreementFinancialBudgetControls(db, agreementId, { kind: 'claim', id: String(claim.id) })
      checkedClaimYears.add(claim.fiscalYearId)
    }
  }
  const checkedReconcileYears = new Set<string>()
  for (const reconciliation of reconciliations) {
    const state = reconcileStates.get(String(reconciliation.id))
    if (!checkedReconcileYears.has(reconciliation.fiscalYearId)
      && state?.lifecycleTerminus === 'positive' && !hasNegativeBudgetOutcome(state)
      && !hasNegativeBudgetOutcome(claimStates.get(String(reconciliation.claimId)))) {
      await assertAgreementFinancialBudgetControls(db, agreementId, { kind: 'reconciliation', id: String(reconciliation.id) })
      checkedReconcileYears.add(reconciliation.fiscalYearId)
    }
  }
}
