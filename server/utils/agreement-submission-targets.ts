import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { useRuntimeConfig } from 'nitropack/runtime'
import type { H3Event } from 'h3'
import type { Kysely, Transaction } from 'kysely'
import { agreementSubmissionTargetSchemas as schemas, type AgreementSubmissionTargetKind } from '~~/shared/types/schemas/agreement-submission-targets'
import type { z } from 'zod'
import type { Database } from '~~/shared/types/database'
import type { AgreementSubmissionPayload } from '~~/shared/types/agreement-submission-database'
import { sumMoney, zeroMoney } from '~~/shared/utils/money'
import { assertDraftAgreementAmendmentCapability, resolveDraftAgreementAmendmentBudgetVersion } from './agreement-amendment'
import { assertAgreementApprovalSubmissionUnlocked } from './agreement-approval-submission'
import {
  AgreementBudgetFinancialLimitError, findAgreementBudgetFinancialLimitViolation, loadAgreementBudgetFinancialLimits
} from './agreement-budget-financial-limits'
import { throwIfAgreementFinancialBudgetError } from './agreement-financial-budget-errors'
import { calculateAgreementBudgetFunding, prepareBudgetCalculationConfiguration, prepareNewBudgetLine } from './agreement-budget-calculation'
import { budgetFundingSourcesByLine, loadBudgetFundingSources, replaceBudgetFundingSources, validateBudgetFundingSources } from './agreement-budget-funding'
import { budgetFiscalYearStableId, budgetLineItemStableId } from './agreement-budget-lineage'
import { resolveAgreementBudgetProponent } from './agreement-budget-proponent'
import { createAgreementClaimAggregate } from './agreement-claim'
import { assertAgreementCurrency, assertCurrencyMoneyValues } from './agreement-currency'
import { assertFiscalYearOverlapsDuration, resolveAgreementAmendmentEffectiveDuration } from './agreement-fiscal-year-duration'
import { createAgreementForecastAggregate } from './agreement-forecast-import'
import { hasAgreementFiscalYearForecastHistory } from './agreement-forecast-versions'
import { assertAgreementFundingModeInput, loadAgreementBudgetManagement } from './agreement-funding-breakdown'
import { badRequest, throwApiError } from './api-errors'
import { parseI18n } from './api-validate'
import { assertBusinessStatusMutationAllowed, resolveBusinessStatusProtection } from './business-status-runtime'
import { fetchAgreementBudgetCostCategory } from './cost-configuration-integrity'
import { databaseMoneyValue, parseDatabaseMoney } from './database-money'
import { hashPublicationDefinition } from './system-publication'

const localPreviewSecret = randomBytes(32).toString('hex')

type BudgetReview = { submissionId: string, revision: number, actorUserId: string | null }

type BudgetRequest = {
  event: H3Event
  agreementId: string
  amendmentId: string
  payload: AgreementSubmissionPayload
  streamId: string
  budgetReview?: BudgetReview
}

type TargetInput = {
  event: H3Event
  agreementId: string
  agencyId: string
  streamId: string
  target: AgreementSubmissionTargetKind
  payload: AgreementSubmissionPayload
  amendmentId: string | null
  expectedBudgetRevision: string | null
  expectedBudgetConfirmation?: string
  budgetReview?: BudgetReview
  primaryUserId: string | null
  actorUserId: string | null
}

/** An expected target precondition that can leave an automatic Submission open. */
export class SubmissionTargetError extends Error {
  /**
   * Stable blocker code and its default description.
   * @param code - Stable blocker code.
   * @param message - Default text describing the blocker.
   */
  constructor(readonly code: string, message: string) {
    super(message)
  }
}

/**
 * Loads the draft version and computes a revision from its persisted contents.
 * @param db - Connection scoped to the selected Agreement.
 * @param input - Contained Amendment identity.
 * @returns Saved contents and stable revision.
 */
const readDraftBudget = async (db: Kysely<Database>, input: Pick<BudgetRequest, 'event' | 'agreementId' | 'amendmentId'>) => {
  const { event, agreementId, amendmentId } = input
  const amendment = await assertDraftAgreementAmendmentCapability(event, db, agreementId, amendmentId, ['budget'])
  const protection = await resolveBusinessStatusProtection(db, 'fundingcaseamendment', amendmentId)
  if (!amendment.egcs_fc_isopen || !protection || protection.locked) {
    throw new SubmissionTargetError('SUBMISSION_AMENDMENT_UNAVAILABLE', 'Choose a writable Draft Amendment that allows budget changes.')
  }
  const versionId = await resolveDraftAgreementAmendmentBudgetVersion(event, db, agreementId, amendmentId)
  const [years, lines] = await Promise.all([
    db.selectFrom('Funding_Case_Agreement_Budget_Fiscal_Year').selectAll()
      .where('egcs_fc_budgetversion', '=', versionId).where('_deleted', '=', false).orderBy('id').execute(),
    db.selectFrom('Funding_Case_Agreement_Budget_Line_Item').selectAll()
      .where('egcs_fc_budgetversion', '=', versionId).where('_deleted', '=', false).orderBy('id').execute()
  ])
  const sources = await loadBudgetFundingSources(db, lines.map(line => String(line.id)))
  sources.sort((left, right) => String(left.id).localeCompare(String(right.id), 'en'))
  const sourcesByLine = budgetFundingSourcesByLine(sources)
  const current = {
    fiscalYears: years.map(year => ({
      fiscalYearId: String(year.egcs_fc_fiscalyear),
      lineItems: lines.filter(line => line.egcs_fc_fundingagreementbudgetfiscalyear === year.id).map(line => ({
        id: String(line.egcs_fc_originalbudgetlineitem ?? line.id),
        egcs_fc_applicantrecipient: String(line.egcs_fc_applicantrecipient),
        egcs_fc_organizationcostcategory: String(line.egcs_fc_organizationcostcategory),
        egcs_fc_costsubsection: line.egcs_fc_costsubsection,
        egcs_fc_costsubsection_fr: line.egcs_fc_costsubsection_fr,
        egcs_fc_description: line.egcs_fc_description,
        egcs_fc_description_fr: line.egcs_fc_description_fr,
        egcs_fc_totalamount: parseDatabaseMoney(line.egcs_fc_totalamount, line.egcs_fc_currency),
        egcs_fc_programfunding: parseDatabaseMoney(line.egcs_fc_programfunding, line.egcs_fc_currency),
        egcs_fc_percentage: line.egcs_fc_percentage,
        egcs_fc_currency: line.egcs_fc_currency,
        egcs_fc_fundingsources: (sourcesByLine.get(String(line.id)) ?? []).map(source => ({
          egcs_fc_fundingsubtype: String(source.egcs_fc_fundingsubtype),
          egcs_fc_amount: source.egcs_fc_amount,
          egcs_fc_description_en: source.egcs_fc_description_en,
          egcs_fc_description_fr: source.egcs_fc_description_fr
        }))
      }))
    }))
  }
  const revision = createHash('sha256').update(JSON.stringify([
    versionId, current,
    lines.map(line => [line.id, line.egcs_fc_pendingfunding, line.egcs_fc_calculationmode, line.egcs_fc_sourcecategory, line.egcs_fc_allowpercentageoverride])
  ])).digest('hex')
  return { versionId, years, lines, revision, current }
}

/**
 * Returns the opaque concurrency token for an authorized automatic receipt.
 * @param db - Authorized read snapshot.
 * @param input - Exact Amendment in the owning Agreement.
 * @returns Current baseline revision without budget contents.
 */
export const readAgreementSubmissionBudgetRevision = async (db: Kysely<Database>, input: Parameters<typeof readDraftBudget>[1]) => {
  const { revision } = await readDraftBudget(db, input)
  await assertAgreementApprovalSubmissionUnlocked(input.event, db, input.agreementId)
  return { revision }
}

/**
 * Preserves the ordinary Amendment budget removal restrictions.
 * @param event - Authorized request.
 * @param db - Authorized read snapshot or write transaction.
 * @param agreementId - Owning Agreement identity.
 * @param removed - Contents omitted from the replacement.
 * @param removed.years - Stable year identities.
 * @param removed.lines - Stable line identities to remove.
 * @param removed.movedLines - Stable line identities changing fiscal year.
 * @returns Nothing when every change is allowed.
 */
const assertBudgetRemovalAllowed = async (
  event: H3Event,
  db: Kysely<Database>,
  agreementId: string,
  removed: { years: string[], lines: string[], movedLines: string[] }
) => {
  if (removed.years.length) {
    const claim = await db.selectFrom('Funding_Case_Agreement_Claim as claim')
      .innerJoin('Funding_Case_Agreement_Budget_Fiscal_Year', 'Funding_Case_Agreement_Budget_Fiscal_Year.id', 'claim.egcs_fc_fiscalyear')
      .select('claim.id').where('claim.egcs_fc_fundingagreement', '=', agreementId)
      .where('claim._deleted', '=', false).where(budgetFiscalYearStableId, 'in', removed.years).executeTakeFirst()
    const payment = await db.selectFrom('Funding_Case_Agreement_Payment as payment')
      .innerJoin('Funding_Case_Agreement_Budget_Fiscal_Year', 'Funding_Case_Agreement_Budget_Fiscal_Year.id', 'payment.egcs_fc_fiscalyear')
      .select('payment.id').where('payment.egcs_fc_fundingagreement', '=', agreementId)
      .where('payment._deleted', '=', false).where(budgetFiscalYearStableId, 'in', removed.years).executeTakeFirst()
    if (claim || payment) {
      await badRequest(event, 'AGREEMENT_BUDGET_FISCAL_YEAR_FINANCIAL_RECORDS_IN_USE', 'apiErrors.agreement.budget_fiscal_year_financial_records_in_use')
    }
    for (const year of removed.years) {
      if (await hasAgreementFiscalYearForecastHistory(db, agreementId, year)) {
        await badRequest(event, 'AGREEMENT_BUDGET_FISCAL_YEAR_IN_USE', 'apiErrors.request.invalid_status')
      }
    }
  }

  const changedLineIds = [...removed.lines, ...removed.movedLines]
  if (changedLineIds.length) {
    const claimLine = await db.selectFrom('Funding_Case_Agreement_Claim_Line_Item as line')
      .innerJoin('Funding_Case_Agreement_Claim as claim', 'claim.id', 'line.egcs_fc_fundingagreementclaim')
      .innerJoin('Funding_Case_Agreement_Budget_Line_Item', 'Funding_Case_Agreement_Budget_Line_Item.id', 'line.egcs_fc_fundingagreementbudgetlineitem')
      .select(budgetLineItemStableId.as('stableId')).where('claim.egcs_fc_fundingagreement', '=', agreementId)
      .where('line._deleted', '=', false).where('claim._deleted', '=', false)
      .where(budgetLineItemStableId, 'in', changedLineIds).executeTakeFirst()
    if (claimLine && removed.movedLines.includes(String(claimLine.stableId))) {
      return await badRequest(event, 'AGREEMENT_BUDGET_LINE_ITEM_CLAIM_MOVE_NOT_ALLOWED', 'apiErrors.agreement.budget_line_item_claim_move_not_allowed')
    }
    if (claimLine) await badRequest(event, 'AGREEMENT_BUDGET_LINE_ITEM_CLAIM_IN_USE', 'apiErrors.agreement.budget_line_item_claim_in_use')
  }
}

/**
 * Plans the entire Draft replacement with the same calculations and validations used for acceptance.
 * @param db - Authorized read snapshot or locked write transaction.
 * @param input - Contained Amendment and proposed contents.
 * @param baseline - Current persisted Draft contents.
 * @param phase - Whether to acquire write-side locks on supporting configuration.
 * @returns Complete final values and the precondition for that proposal.
 */
const planBudgetReplacement = async (
  db: Kysely<Database>,
  input: BudgetRequest,
  baseline: Awaited<ReturnType<typeof readDraftBudget>>,
  phase: 'preview' | 'replace'
) => {
  const { event, agreementId, amendmentId, streamId } = input
  const { versionId, years, lines, revision } = baseline
  const replacement = await parseI18n(event, schemas.amendment_budget, input.payload)
  const desiredYears = new Set(replacement.fiscalYears.map(year => year.fiscalYearId))
  const desiredLines = new Set(replacement.fiscalYears.flatMap(year => year.lineItems.flatMap(line => line.id ? [line.id] : [])))
  const existingById = new Map(lines.map(line => [line.egcs_fc_originalbudgetlineitem ?? line.id, line]))
  const yearsByFiscalYear = new Map(years.map(year => [year.egcs_fc_fiscalyear, year]))
  const removedYears = years.filter(year => !desiredYears.has(year.egcs_fc_fiscalyear))
  const removedLines = lines.filter(line => !desiredLines.has(line.egcs_fc_originalbudgetlineitem ?? line.id))

  const movedLines: string[] = []
  for (const year of replacement.fiscalYears) {
    const yearId = yearsByFiscalYear.get(year.fiscalYearId)?.id
    for (const line of year.lineItems) {
      if (!line.id) continue
      const existing = existingById.get(line.id)
      if (!existing) {
        throw new SubmissionTargetError('SUBMISSION_BUDGET_LINE_IDENTITY', 'A retained budget line ID does not exist in this Amendment.')
      }
      if (existing.egcs_fc_fundingagreementbudgetfiscalyear !== yearId) movedLines.push(line.id)
    }
  }

  await assertBudgetRemovalAllowed(event, db, agreementId, {
    years: removedYears.map(year => year.egcs_fc_originalbudgetfiscalyear ?? year.id),
    lines: removedLines.map(line => line.egcs_fc_originalbudgetlineitem ?? line.id),
    movedLines
  })

  const settings = await loadAgreementBudgetManagement(db, agreementId)
  const fundingMode = settings.egcs_tp_budgetfundingmode
  const currency = await assertAgreementCurrency(event, db, agreementId)
  /**
   * Resolves one proposed line and the inputs to its shared budget calculation.
   * @param fiscalYearId - Agency fiscal year containing the proposed line.
   * @param index - Position used to identify a new line within the plan.
   * @param candidate - Normalized submission line, including optional retained identity.
   * @returns Prepared line, retained row, calculation settings and funding.
   */
  const prepareLine = async (
    fiscalYearId: string,
    index: number,
    candidate: z.infer<typeof schemas.amendment_budget>['fiscalYears'][number]['lineItems'][number]
  ) => {
    const { id, egcs_fc_fundingsources: fundingSources = [], ...line } = candidate
    const existing = id ? existingById.get(id) : undefined
    const categoryId = line.egcs_fc_organizationcostcategory
    const lock = phase === 'preview' ? 'read_only' : undefined
    const category = await fetchAgreementBudgetCostCategory(db, streamId, categoryId, { retainedCostCategoryId: existing?.egcs_fc_organizationcostcategory, lock })
    if (!category) return await badRequest(event, 'INVALID_AGREEMENT_BUDGET_LINE_ITEM', 'apiErrors.agreement.invalid_cost_category_line_item')
    const recipientId = await resolveAgreementBudgetProponent(event, db, {
      agreementId, proponentId: line.egcs_fc_applicantrecipient, savedProponentId: existing?.egcs_fc_applicantrecipient, lock
    })
    if (line.egcs_fc_currency !== currency) await assertAgreementCurrency(event, db, agreementId, line.egcs_fc_currency)
    await assertCurrencyMoneyValues(event, currency, [
      ...[line.egcs_fc_totalamount, line.egcs_fc_programfunding].filter(amount => amount !== undefined),
      ...fundingSources.map(source => source.egcs_fc_amount)
    ])
    await assertAgreementFundingModeInput(event, fundingMode, { sources: fundingSources })
    await validateBudgetFundingSources(event, db, streamId, fundingSources, existing?.id)
    const retainedCalculation = existing?.egcs_fc_organizationcostcategory === categoryId ? existing.id : undefined
    const calculation = await prepareBudgetCalculationConfiguration(event, db, line, retainedCalculation)
    if (calculation.egcs_fc_calculationmode === 'manual' && line.egcs_fc_programfunding === undefined) {
      return await badRequest(event, 'PROGRAM_FUNDING_REQUIRED', 'apiErrors.agreement.program_funding_required')
    }
    const { egcs_fc_fundingagreementbudgetfiscalyear: _year, ...prepared } = await prepareNewBudgetLine(event, settings, {
      ...line, egcs_fc_fundingagreementbudgetfiscalyear: fiscalYearId
    }, line.egcs_fc_programfunding ?? zeroMoney(currency))
    if (settings.egcs_tp_hidecostsubsection && existing) {
      prepared.egcs_fc_costsubsection = existing.egcs_fc_costsubsection
      prepared.egcs_fc_costsubsection_fr = existing.egcs_fc_costsubsection_fr
    }
    const sources = fundingSources.map(source => ({
      ...source,
      egcs_fc_description_en: source.egcs_fc_description_en ?? null,
      egcs_fc_description_fr: source.egcs_fc_description_fr ?? null
    }))
    return {
      existing, id, prepared: { ...prepared, egcs_fc_applicantrecipient: recipientId }, sources, calculation,
      row: {
        id: id ?? `new:${fiscalYearId}:${index}`, fiscalYearId, versionId,
        currency, categoryId: category.categoryId,
        mode: calculation.egcs_fc_calculationmode, sourceCategoryId: calculation.egcs_fc_sourcecategory,
        percentage: calculation.egcs_fc_percentage,
        programFunding: prepared.egcs_fc_programfunding,
        totalAmount: fundingMode === 'program_only' && existing?.egcs_fc_currency === currency
          ? parseDatabaseMoney(existing.egcs_fc_totalamount, existing.egcs_fc_currency)
          : prepared.egcs_fc_totalamount,
        otherFunding: sumMoney(sources.map(source => source.egcs_fc_amount), currency),
        description: prepared.egcs_fc_description
      }
    }
  }
  const plannedYears: {
    fiscalYearId: string
    configuredYear: { egcs_ay_startdate: Date, egcs_ay_enddate: Date }
    lineItems: Awaited<ReturnType<typeof prepareLine>>[]
  }[] = []
  const duration = await resolveAgreementAmendmentEffectiveDuration(db, amendmentId)
  for (const { fiscalYearId, lineItems } of replacement.fiscalYears) {
    const configuredYear = await db.selectFrom('Transfer_Payment_Stream_Budget')
      .innerJoin('Transfer_Payment_Fiscal_Year_Budget', 'Transfer_Payment_Fiscal_Year_Budget.id', 'Transfer_Payment_Stream_Budget.egcs_tp_transferpaymentbudget')
      .innerJoin('Agency_Fiscal_Year', 'Agency_Fiscal_Year.id', 'Transfer_Payment_Fiscal_Year_Budget.egcs_tp_fiscalyear')
      .select(['Agency_Fiscal_Year.egcs_ay_startdate', 'Agency_Fiscal_Year.egcs_ay_enddate'])
      .where('Transfer_Payment_Stream_Budget.egcs_tp_transferpaymentstream', '=', streamId)
      .where('Agency_Fiscal_Year.id', '=', fiscalYearId)
      .where('Transfer_Payment_Stream_Budget._deleted', '=', false)
      .where('Transfer_Payment_Fiscal_Year_Budget._deleted', '=', false)
      .where('Agency_Fiscal_Year._deleted', '=', false)
      .$if(phase === 'replace', query => query.forShare(['Agency_Fiscal_Year', 'Transfer_Payment_Fiscal_Year_Budget']))
      .executeTakeFirst()
    if (!configuredYear) return await badRequest(event, 'INVALID_AGREEMENT_BUDGET_FISCAL_YEAR', 'apiErrors.agreement.invalid_budget_fiscal_year')
    await assertFiscalYearOverlapsDuration(event, configuredYear, duration)
    const proposedLines: Awaited<ReturnType<typeof prepareLine>>[] = []
    for (const [index, line] of lineItems.entries()) proposedLines.push(await prepareLine(fiscalYearId, index, line))
    plannedYears.push({ fiscalYearId, configuredYear, lineItems: proposedLines })
  }
  const plannedLines = plannedYears.flatMap(year => year.lineItems)
  const { amounts, totals } = await calculateAgreementBudgetFunding(event, fundingMode, plannedLines.map(line => line.row))
  const fiscalYears = plannedYears.map(year => ({
    ...year,
    lineItems: year.lineItems.map(({ id, row, existing, sources, prepared, calculation }) => ({
      existing,
      categoryId: row.categoryId,
      calculation,
      line: {
        ...(id ? { id } : {}),
        ...prepared,
        egcs_fc_calculationmode: calculation.egcs_fc_calculationmode,
        egcs_fc_pendingfunding: false,
        egcs_fc_percentage: calculation.egcs_fc_percentage == null ? null : Number(calculation.egcs_fc_percentage),
        egcs_fc_programfunding: amounts.get(row.id)!,
        egcs_fc_totalamount: totals.get(row.id)!,
        egcs_fc_fundingsources: sources
      }
    }))
  }))

  const limits = await loadAgreementBudgetFinancialLimits(db, streamId)
  const subtypeIds = [...new Set(plannedLines.flatMap(line => line.sources.map(source => source.egcs_fc_fundingsubtype)))].sort()
  const fundingTypes = subtypeIds.length
    ? await db.selectFrom('Agency_Funding_Subtype as subtype')
        .innerJoin('Agency_Funding_Type as type', 'type.id', 'subtype.egcs_ay_fundingtype')
        .select(['subtype.id', 'type.egcs_ay_instacking as stacking', 'type.egcs_ay_incostsharing as costSharing'])
        .where('subtype.id', 'in', subtypeIds).orderBy('subtype.id').execute()
    : []
  const typesBySubtype = new Map(fundingTypes.map(type => [type.id, type]))
  const proposed = { fiscalYears: fiscalYears.map(({ fiscalYearId, lineItems }) => ({ fiscalYearId, lineItems: lineItems.map(({ line }) => line) })) }
  const secret = process.env.BETTER_AUTH_SECRET || useRuntimeConfig().authSecret || localPreviewSecret
  const confirmation = createHmac('sha256', secret).update(JSON.stringify([
    'agreement-submission-budget', agreementId, amendmentId, revision, streamId, input.budgetReview,
    hashPublicationDefinition(input.payload), replacement, proposed, settings, currency, duration, limits, fundingTypes,
    fiscalYears.map(year => [year.configuredYear, year.lineItems.map(({ categoryId, calculation }) => [categoryId, calculation])])
  ])).digest('hex')
  if (limits) {
    try {
      const violation = findAgreementBudgetFinancialLimitViolation(limits, fiscalYears.flatMap(year => year.lineItems.map(({ line }, index) => ({
        id: line.id ?? `new:${year.fiscalYearId}:${index}`,
        proponentId: line.egcs_fc_applicantrecipient,
        programFunding: line.egcs_fc_programfunding,
        totalAmount: line.egcs_fc_totalamount,
        stackingFunding: line.egcs_fc_fundingsources.filter(source => typesBySubtype.get(source.egcs_fc_fundingsubtype)?.stacking)
          .map(source => source.egcs_fc_amount),
        costSharingFunding: line.egcs_fc_fundingsources.filter(source => typesBySubtype.get(source.egcs_fc_fundingsubtype)?.costSharing)
          .map(source => source.egcs_fc_amount)
      }))), currency, fundingMode)
      if (violation) throw new AgreementBudgetFinancialLimitError(violation)
    } catch (error: unknown) {
      await throwIfAgreementFinancialBudgetError(event, error)
      throw error
    }
  }
  return { fiscalYears, proposed, confirmation, removedYears, removedLines, yearsByFiscalYear }
}

/**
 * Compares the current and fully calculated proposed Amendment Budget without writes.
 * @param db - Authorized read snapshot.
 * @param input - Contained Amendment and proposed replacement.
 * @returns The two budgets, persisted baseline revision and exact proposal confirmation.
 */
export const previewAgreementSubmissionBudget = async (db: Kysely<Database>, input: BudgetRequest) => {
  const baseline = await readDraftBudget(db, input)
  await assertAgreementApprovalSubmissionUnlocked(input.event, db, input.agreementId)
  const plan = await planBudgetReplacement(db, input, baseline, 'preview')
  const existingById = new Map(baseline.lines.map(line => [line.egcs_fc_originalbudgetlineitem ?? line.id, line]))
  const current = { fiscalYears: baseline.current.fiscalYears.map(year => ({
    ...year,
    lineItems: year.lineItems.map(line => {
      const existing = existingById.get(line.id)!
      return {
        ...line,
        egcs_fc_calculationmode: existing.egcs_fc_calculationmode,
        egcs_fc_pendingfunding: existing.egcs_fc_pendingfunding,
        egcs_fc_percentage: line.egcs_fc_percentage == null ? null : Number(line.egcs_fc_percentage)
      }
    })
  })) }
  return { budgetVersionId: baseline.versionId, revision: baseline.revision, confirmation: plan.confirmation, current, replacement: plan.proposed }
}

/**
 * Applies the same complete plan that preview produces inside the caller's transaction.
 * @param trx - Freshly authorized Agreement transaction.
 * @param input - Complete candidate and budget preconditions.
 * @returns Updated Amendment identity.
 */
const replaceDraftBudget = async (trx: Transaction<Database>, input: BudgetRequest & {
  expectedBudgetRevision: string | null
  expectedBudgetConfirmation?: string
}) => {
  const { event, agreementId, amendmentId } = input
  const baseline = await readDraftBudget(trx, input)
  const { versionId, revision } = baseline
  await assertBusinessStatusMutationAllowed(event, trx, 'fundingcaseamendment', amendmentId)
  await assertAgreementApprovalSubmissionUnlocked(event, trx, agreementId)
  const stale = () => new SubmissionTargetError('SUBMISSION_BUDGET_REVISION', 'The budget changed. Review the latest proposal before replacing it.')
  if (revision !== input.expectedBudgetRevision) throw stale()
  const plan = await planBudgetReplacement(trx, input, baseline, 'replace')
  if (input.expectedBudgetConfirmation !== undefined) {
    const expected = Buffer.from(plan.confirmation)
    const supplied = Buffer.from(input.expectedBudgetConfirmation)
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw stale()
  }
  if (plan.removedLines.length) {
    const ids = plan.removedLines.map(line => line.id)
    await trx.updateTable('Funding_Case_Agreement_Budget_Line_Item_Funding').set({ _deleted: true })
      .where('egcs_fc_budgetlineitem', 'in', ids).where('_deleted', '=', false).execute()
    await trx.updateTable('Funding_Case_Agreement_Budget_Line_Item').set({ _deleted: true }).where('id', 'in', ids).execute()
  }
  if (plan.removedYears.length) {
    await trx.updateTable('Funding_Case_Agreement_Budget_Fiscal_Year').set({ _deleted: true })
      .where('id', 'in', plan.removedYears.map(year => year.id)).execute()
  }

  // Release uniqueness slots before applying all-other lines that depart their old fiscal year.
  const vacating = plan.fiscalYears.flatMap(year => year.lineItems.flatMap(({ existing, line }) => {
    if (existing?.egcs_fc_calculationmode !== 'all_other') return []
    const sameSlot = line.egcs_fc_calculationmode === 'all_other'
      && existing.egcs_fc_fundingagreementbudgetfiscalyear === plan.yearsByFiscalYear.get(year.fiscalYearId)?.id
      && existing.egcs_fc_currency === line.egcs_fc_currency
    return sameSlot ? [] : [existing.id]
  }))
  if (vacating.length) {
    await trx.updateTable('Funding_Case_Agreement_Budget_Line_Item').set({
      egcs_fc_calculationmode: 'manual',
      egcs_fc_sourcecategory: null,
      egcs_fc_percentage: null,
      egcs_fc_allowpercentageoverride: false
    }).where('id', 'in', vacating).execute()
  }
  for (const year of plan.fiscalYears) {
    const fiscalYear = plan.yearsByFiscalYear.get(year.fiscalYearId) ?? await trx
      .insertInto('Funding_Case_Agreement_Budget_Fiscal_Year')
      .values({ egcs_fc_fundingagreement: agreementId, egcs_fc_budgetversion: versionId, egcs_fc_fiscalyear: year.fiscalYearId })
      .returning('id').executeTakeFirstOrThrow()
    for (const { existing, calculation, line: { id: _identity, egcs_fc_fundingsources: sources, ...line } } of year.lineItems) {
      const values = {
        ...line,
        ...calculation,
        egcs_fc_fundingagreement: agreementId,
        egcs_fc_budgetversion: versionId,
        egcs_fc_fundingagreementbudgetfiscalyear: fiscalYear.id,
        egcs_fc_totalamount: databaseMoneyValue(line.egcs_fc_totalamount),
        egcs_fc_programfunding: databaseMoneyValue(line.egcs_fc_programfunding)
      }
      const row = existing
        ? await trx.updateTable('Funding_Case_Agreement_Budget_Line_Item').set(values)
            .where('id', '=', existing.id).returning('id').executeTakeFirstOrThrow()
        : await trx.insertInto('Funding_Case_Agreement_Budget_Line_Item').values(values)
            .returning('id').executeTakeFirstOrThrow()
      await replaceBudgetFundingSources(trx, row.id, sources)
    }
  }
  return { id: amendmentId }
}

/**
 * Materializes a target inside the caller's fresh, authorized Agreement transaction.
 * @param trx - Transaction holding the Agreement and target authorization.
 * @param input - Version-one target payload and transaction-resolved owner.
 * @returns Created Claim or Forecast ID, or the updated Amendment ID.
 */
export const applyAgreementSubmissionTarget = async (trx: Transaction<Database>, input: TargetInput): Promise<{ id: string }> => {
  const { event, agreementId, streamId, agencyId, amendmentId, payload, primaryUserId } = input
  if (input.target === 'amendment_budget') {
    if (!amendmentId) {
      throw new SubmissionTargetError('SUBMISSION_AMENDMENT_REQUIRED', 'Choose an Amendment before replacing its proposed budget.')
    }
    return await replaceDraftBudget(trx, { ...input, amendmentId })
  }
  if (!primaryUserId) {
    throw new SubmissionTargetError('SUBMISSION_PRIMARY_REQUIRED', 'The Agreement needs an active primary assignee before processing this submission.')
  }

  const currency = await assertAgreementCurrency(event, trx, agreementId)
  if (input.target === 'claim') {
    const candidate = await parseI18n(event, schemas.claim, payload)
    await assertCurrencyMoneyValues(event, currency, candidate.lineItems.map(line => line.amount))
    const result = await createAgreementClaimAggregate(trx, {
      ...candidate,
      agreementId,
      streamId,
      receivedDate: new Date(`${candidate.receivedDate}T00:00:00Z`),
      submissionUuid: null,
      lineItems: candidate.lineItems.map(line => ({ ...line, currency }))
    }, agencyId, primaryUserId, { event, answers: candidate.customFields })
    if (result.status === 'created') return { id: result.claimId }
    if (result.status === 'initial_approval_required') {
      return await throwApiError(event, { statusCode: 409, code: 'AGREEMENT_INITIAL_APPROVAL_REQUIRED', key: 'apiErrors.agreement.initial_approval_required' })
    }
    if (result.status === 'applicant_recipient_unavailable') {
      return await badRequest(event, 'AGREEMENT_CLAIM_PROPONENT_INVALID', 'apiErrors.agreement.invalid_claim_proponent')
    }
    if (result.status === 'fiscal_year_unavailable') {
      return await badRequest(event, 'INVALID_AGREEMENT_CLAIM_FISCAL_YEAR', 'apiErrors.agreement.invalid_claim_fiscal_year')
    }
    throw new SubmissionTargetError('SUBMISSION_CLAIM_UNAVAILABLE', 'The Agreement cannot create the Claim in Draft status.')
  }

  const candidate = await parseI18n(event, schemas.forecast, payload)
  await assertCurrencyMoneyValues(event, currency, candidate.lineItems.flatMap(line => [line.amount, ...(line.totalAmount ? [line.totalAmount] : [])]))
  const monthKeys = candidate.lineItems.map(line => `${line.budgetLineItemId}:${line.month}`)
  if (new Set(monthKeys).size !== monthKeys.length) {
    throw new SubmissionTargetError('SUBMISSION_FORECAST_DUPLICATE_MONTH', 'The Forecast repeats a month on the same budget line.')
  }
  const result = await createAgreementForecastAggregate(trx, {
    ...candidate,
    agreementId,
    streamId,
    lineItems: candidate.lineItems.map(line => ({ ...line, currency }))
  }, agencyId, primaryUserId)
  if (result.status === 'created') return { id: result.forecastId }
  if (result.status === 'fiscal_year_unavailable') {
    return await badRequest(event, 'INVALID_AGREEMENT_BUDGET_FISCAL_YEAR', 'apiErrors.agreement.invalid_budget_fiscal_year')
  }
  if (result.status === 'recipient_unavailable') {
    return await badRequest(event, 'AGREEMENT_FORECAST_PROPONENT_INVALID', 'apiErrors.agreement.invalid_claim_proponent')
  }
  if (result.status === 'total_cost_mismatch') {
    return await badRequest(event, 'AGREEMENT_FORECAST_TOTAL_COST_INVALID', 'apiErrors.agreement.funding_breakdown_required')
  }
  if (result.status === 'total_cost_hidden') {
    return await badRequest(event, 'AGREEMENT_FORECAST_TOTAL_COST_INVALID', 'apiErrors.agreement.total_cost_read_only')
  }
  throw new SubmissionTargetError('SUBMISSION_FORECAST_UNAVAILABLE', 'The Agreement cannot create the Forecast in Draft status.')
}
