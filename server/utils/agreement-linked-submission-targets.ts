import { createHash } from 'node:crypto'
import type { LinkedSubmissionOverviewReview } from '~~/shared/types/agreement-submission'
import { parsePersistedClaimCustomFieldDefinitions, validateClaimCustomFields } from './agreement-claim-custom-fields'
/* eslint-disable jsdoc/require-jsdoc -- Linked submissions use the domain's ordinary target checks. */
import type { H3Event } from 'h3'
import type { Kysely, Transaction } from 'kysely'
import type { AgreementSubmissionPayload } from '~~/shared/types/agreement-submission-database'
import type { Database, JsonValue } from '~~/shared/types/database'
import { agreementSubmissionTargetSchemas as schemas } from '~~/shared/types/schemas/agreement-submission-targets'
import { matchClaimSubmissionLines } from '~~/shared/utils/agreement-submission-claim-lines'
import { addMoney, compareMoney, isPersistableMoney, maxMoney, subtractMoney, sumMoney, type Money } from '~~/shared/utils/money'
import { lockAgreementAggregate } from './agreement-aggregate-lock'
import { readAgreementBudgetLineReference } from './agreement-budget-lineage'
import { assertAgreementClaimBudgetFiscalYear, assertAgreementClaimBudgetLineItem } from './agreement-claim'
import { isAgreementClaimProponentAvailable } from './agreement-claim-proponent'
import { assertAgreementCorrectionFinancialWriteAllowed } from './correction-lock'
import { assertAgreementCurrency, assertCurrencyMoneyValues } from './agreement-currency'
import { assertAgreementFinancialBudgetControls } from './agreement-financial-budget-controls'
import { assertAgreementForecastBudgetFiscalYear, assertAgreementForecastBudgetLineItem } from './agreement-forecast'
import { loadAgreementBudgetManagement } from './agreement-funding-breakdown'
import { SubmissionTargetError } from './agreement-submission-targets'
import { badRequest } from './api-errors'
import { parseI18n } from './api-validate'
import { assertBusinessStatusMutationAllowed } from './business-status-runtime'
import { databaseMoneyText, databaseMoneyValue, parseDatabaseMoney } from './database-money'

type LinkedTarget = {
  agreementId: string
  target: 'claim' | 'forecast'
  targetId: string
}

const linkedTargetEntity = {
  claim: 'fundingcaseagreementclaim',
  forecast: 'fundingcaseforecast'
} as const

const missingTarget = () => new SubmissionTargetError('SUBMISSION_TARGET_UNAVAILABLE', 'The linked Draft is unavailable.')

const readClaim = (db: Kysely<Database>, { agreementId, targetId }: LinkedTarget) => db
  .selectFrom('Funding_Case_Agreement_Claim').select([
    'egcs_fc_applicantrecipient', 'egcs_fc_fiscalyear', 'egcs_fc_isfinalforyear',
    'egcs_fc_periodstart', 'egcs_fc_periodend', 'egcs_fc_receiveddate',
    'egcs_fc_customfielddefinitions', 'egcs_fc_customfields'
  ]).where('id', '=', targetId).where('egcs_fc_fundingagreement', '=', agreementId)
  .where('_deleted', '=', false).executeTakeFirst()

const readForecast = (db: Kysely<Database>, { agreementId, targetId }: LinkedTarget) => db
  .selectFrom('Funding_Case_Agreement_Forecast').select(['egcs_fc_fiscalyear', 'egcs_fc_active'])
  .where('id', '=', targetId).where('egcs_fc_fundingagreement', '=', agreementId)
  .where('_deleted', '=', false).executeTakeFirst()

export const assertLinkedSubmissionTargetEditable = async (trx: Transaction<Database>, input: LinkedTarget & { event: H3Event }) => {
  const { target, targetId, agreementId, event } = input
  if (!await lockAgreementAggregate(trx, target, targetId, agreementId)) throw missingTarget()
  const status = await assertBusinessStatusMutationAllowed(event, trx, linkedTargetEntity[target], targetId)
  const forecast = target === 'forecast' ? await readForecast(trx, input) : null
  if (!status.status.isDraft || forecast?.egcs_fc_active) throw missingTarget()
}

const readClaimLines = (db: Kysely<Database>, targetId: string) => db
  .selectFrom('Funding_Case_Agreement_Claim_Line_Item')
  .select(({ ref }) => [
    'id', 'egcs_fc_fundingagreementbudgetlineitem', 'egcs_fc_submittedcostcategory',
    'egcs_fc_submittedcostsubsection', 'egcs_fc_submittedlineitem', 'egcs_fc_description', 'egcs_fc_currency', 'egcs_fc_sourcesubmissionlineid',
    databaseMoneyText(ref('egcs_fc_amount')).as('egcs_fc_amount'),
    databaseMoneyText(ref('egcs_fc_totalamount')).as('egcs_fc_totalamount')
  ]).where('egcs_fc_fundingagreementclaim', '=', targetId).where('_deleted', '=', false).orderBy('id').execute()

const claimLineIdentity = (line: Awaited<ReturnType<typeof readClaimLines>>[number]) => ({
  sourceLineId: line.egcs_fc_sourcesubmissionlineid,
  budgetLineItemId: line.egcs_fc_fundingagreementbudgetlineitem,
  submittedCostCategory: line.egcs_fc_submittedcostcategory,
  submittedCostSubsection: line.egcs_fc_submittedcostsubsection,
  submittedLineItem: line.egcs_fc_submittedlineitem,
  description: line.egcs_fc_description
})

const readForecastLines = (db: Kysely<Database>, targetId: string) => db
  .selectFrom('Funding_Case_Agreement_Forecast_Line_Item')
  .select(({ ref }) => [
    'id', 'egcs_fc_fundingagreementbudgetlineitem', 'egcs_fc_month', 'egcs_fc_currency',
    databaseMoneyText(ref('egcs_fc_amount')).as('egcs_fc_amount'),
    databaseMoneyText(ref('egcs_fc_totalamount')).as('egcs_fc_totalamount')
  ]).where('egcs_fc_agreementforecast', '=', targetId).where('_deleted', '=', false).orderBy('id').execute()

type LineFunding = { egcs_fc_fundingsubtype: string; egcs_fc_amount: Money }

const readLineFunding = async (
  db: Kysely<Database>,
  target: LinkedTarget['target'],
  lines: readonly { id: string; egcs_fc_currency: string }[]
): Promise<Map<string, LineFunding[]>> => {
  const byLine = new Map<string, LineFunding[]>()
  if (lines.length === 0) return byLine
  const currencies = new Map(lines.map(line => [line.id, line.egcs_fc_currency]))
  const ids = [...currencies.keys()]
  const rows = target === 'forecast'
    ? await db.selectFrom('Funding_Case_Agreement_Forecast_Line_Item_Funding')
        .select(({ ref }) => ['egcs_fc_forecastlineitem as lineId', 'egcs_fc_fundingsubtype', databaseMoneyText(ref('egcs_fc_amount')).as('amount')])
        .where('egcs_fc_forecastlineitem', 'in', ids).where('_deleted', '=', false).orderBy('id').execute()
    : await db.selectFrom('Funding_Case_Agreement_Claim_Line_Item_Funding')
        .select(({ ref }) => ['egcs_fc_claimlineitem as lineId', 'egcs_fc_fundingsubtype', databaseMoneyText(ref('egcs_fc_amount')).as('amount')])
        .where('egcs_fc_claimlineitem', 'in', ids).where('_deleted', '=', false).orderBy('id').execute()
  for (const row of rows) {
    const currency = currencies.get(row.lineId)
    if (currency === undefined) throw missingTarget()
    const sources = byLine.get(row.lineId) ?? []
    sources.push({
      egcs_fc_fundingsubtype: String(row.egcs_fc_fundingsubtype),
      egcs_fc_amount: parseDatabaseMoney(row.amount, currency)
    })
    byLine.set(row.lineId, sources)
  }
  return byLine
}

const isPayloadObject = (json: JsonValue): json is AgreementSubmissionPayload => json !== null
  && typeof json === 'object' && !Array.isArray(json)

const matchingSourceLine = (source: AgreementSubmissionPayload[], budgetLineId: string | null, month?: number) => {
  const index = source.findIndex(line => (line.budgetLineItemId ?? null) === budgetLineId
    && (month === undefined || line.month === month))
  if (index === -1) return {}
  return source.splice(index, 1)[0] ?? {}
}

const optionalSnapshotValue = (source: AgreementSubmissionPayload, key: string, value: JsonValue | undefined) => {
  return value != null || Object.hasOwn(source, key) ? { [key]: value ?? null } : {}
}

const lineAmountsSnapshot = (
  line: { egcs_fc_amount: string; egcs_fc_totalamount: string; egcs_fc_currency: string },
  source: AgreementSubmissionPayload,
  fundingSources: LineFunding[]
): AgreementSubmissionPayload => {
  const amount = parseDatabaseMoney(line.egcs_fc_amount, line.egcs_fc_currency)
  const total = parseDatabaseMoney(line.egcs_fc_totalamount, line.egcs_fc_currency)
  return {
    amount,
    ...optionalSnapshotValue(source, 'totalAmount', compareMoney(amount, total) === 0 && !Object.hasOwn(source, 'totalAmount') ? undefined : total),
    ...optionalSnapshotValue(source, 'fundingSources', fundingSources.length || Object.hasOwn(source, 'fundingSources') ? fundingSources : undefined)
  }
}

export const readLinkedSubmissionSnapshot = async (
  db: Kysely<Database>,
  input: LinkedTarget & { sourcePayload: AgreementSubmissionPayload }
): Promise<AgreementSubmissionPayload> => {
  const { target, targetId, sourcePayload } = input
  const sourceLines = Array.isArray(sourcePayload.lineItems) ? sourcePayload.lineItems.filter(isPayloadObject) : []
  if (target === 'claim') {
    const claim = await readClaim(db, input)
    if (!claim) throw missingTarget()
    const definitions = await parsePersistedClaimCustomFieldDefinitions(claim.egcs_fc_customfielddefinitions)
    const lines = await readClaimLines(db, targetId)
    const lineFunding = await readLineFunding(db, target, lines)
    const matches = matchClaimSubmissionLines(sourceLines, lines.map(claimLineIdentity), 'snapshot')
    const lineItems = lines.map((line, index) => {
      const sourceIndex = matches.get(index)
      const source = sourceIndex === undefined ? {} : sourceLines[sourceIndex] ?? {}
      return {
        ...source,
        ...optionalSnapshotValue(source, 'sourceLineId', line.egcs_fc_sourcesubmissionlineid),
        ...optionalSnapshotValue(source, 'budgetLineItemId', line.egcs_fc_fundingagreementbudgetlineitem),
        ...optionalSnapshotValue(source, 'submittedCostCategory', line.egcs_fc_submittedcostcategory),
        ...optionalSnapshotValue(source, 'submittedCostSubsection', line.egcs_fc_submittedcostsubsection),
        ...optionalSnapshotValue(source, 'submittedLineItem', line.egcs_fc_submittedlineitem),
        description: line.egcs_fc_description,
        ...lineAmountsSnapshot(line, source, lineFunding.get(line.id) ?? [])
      }
    })
    return {
      ...sourcePayload,
      applicantRecipientId: claim.egcs_fc_applicantrecipient,
      fiscalYearId: claim.egcs_fc_fiscalyear,
      isFinalForYear: claim.egcs_fc_isfinalforyear,
      periodStart: claim.egcs_fc_periodstart,
      periodEnd: claim.egcs_fc_periodend,
      receivedDate: new Date(claim.egcs_fc_receiveddate).toISOString().slice(0, 10),
      ...optionalSnapshotValue(sourcePayload, 'customFields',
        Object.hasOwn(sourcePayload, 'customFields') || definitions.length ? claim.egcs_fc_customfields : undefined),
      lineItems
    }
  }
  const forecast = await readForecast(db, input)
  if (!forecast) throw missingTarget()
  const lines = await readForecastLines(db, targetId)
  const lineFunding = await readLineFunding(db, target, lines)
  const lineItems = []
  for (const line of lines) {
    const source = matchingSourceLine(sourceLines, line.egcs_fc_fundingagreementbudgetlineitem, line.egcs_fc_month)
    lineItems.push({
      ...source,
      budgetLineItemId: line.egcs_fc_fundingagreementbudgetlineitem,
      month: line.egcs_fc_month,
      ...lineAmountsSnapshot(line, source, lineFunding.get(line.id) ?? [])
    })
  }
  return { ...sourcePayload, fiscalYearId: forecast.egcs_fc_fiscalyear, lineItems }
}

export const linkedSubmissionDecisionDigest = (snapshot: AgreementSubmissionPayload) =>
  createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')

export const readLinkedSubmissionOverviewReview = async (
  db: Kysely<Database>, input: LinkedTarget
): Promise<LinkedSubmissionOverviewReview | null> => {
  const submission = await db.selectFrom('Funding_Case_Agreement_Submission')
    .select(['id', 'egcs_fc_revision', 'egcs_fc_state', 'egcs_fc_payload'])
    .where('egcs_fc_fundingagreement', '=', input.agreementId)
    .where('egcs_fc_target', '=', input.target).where('egcs_fc_result', '=', input.targetId)
    .where('_deleted', '=', false).executeTakeFirst()
  if (!submission) return null
  return {
    submissionId: submission.id,
    revision: submission.egcs_fc_revision,
    decisionDigest: submission.egcs_fc_state === 'reviewing'
      ? linkedSubmissionDecisionDigest(await readLinkedSubmissionSnapshot(db, { ...input, sourcePayload: submission.egcs_fc_payload }))
      : null
  }
}

type ClaimSourceLines = ReturnType<typeof schemas.claim.parse>['lineItems']

const sameClaimSourceLines = (previous: ClaimSourceLines, revised: ClaimSourceLines) => {
  if (previous.length !== revised.length) return false
  // The Claim schema already rejects duplicate source line IDs.
  if (previous.some(line => line.sourceLineId === undefined) || revised.some(line => line.sourceLineId === undefined)) {
    return JSON.stringify(previous) === JSON.stringify(revised)
  }
  const previousById = new Map(previous.map(line => [line.sourceLineId, line]))
  return revised.every(line => JSON.stringify(previousById.get(line.sourceLineId)) === JSON.stringify(line))
}

const removeClaimLine = async (trx: Transaction<Database>, lineId: string) => {
  await trx.updateTable('Funding_Case_Agreement_Claim_Line_Item_Funding').set({ _deleted: true })
    .where('egcs_fc_claimlineitem', '=', lineId).where('_deleted', '=', false).execute()
  await trx.updateTable('Funding_Case_Agreement_Claim_Line_Item').set({ _deleted: true }).where('id', '=', lineId).executeTakeFirstOrThrow()
}

export const applyLinkedSubmissionRevision = async (
  trx: Transaction<Database>,
  input: LinkedTarget & { event: H3Event; payload: AgreementSubmissionPayload; previousSourcePayload: AgreementSubmissionPayload }
): Promise<void> => {
  const { event, agreementId, target, targetId, payload } = input
  await assertLinkedSubmissionTargetEditable(trx, input)
  await assertAgreementCorrectionFinancialWriteAllowed(event, trx, agreementId)
  const currency = await assertAgreementCurrency(event, trx, agreementId)
  const { egcs_tp_budgetfundingmode: mode } = await loadAgreementBudgetManagement(trx, agreementId)

  if (target === 'claim') {
    const revised = await parseI18n(event, schemas.claim, payload)
    const claim = await readClaim(trx, input)
    if (!claim) throw missingTarget()
    const answers = await validateClaimCustomFields(event, claim.egcs_fc_customfielddefinitions, {
      answers: revised.customFields ?? {}, requireAnswers: true, path: 'customFields', currency
    })
    const reconcile = await trx.selectFrom('Funding_Case_Agreement_Claim_Reconcile').select('id')
      .where('egcs_fc_fundingagreementclaim', '=', targetId).where('_deleted', '=', false).executeTakeFirst()
    if (reconcile) throw new SubmissionTargetError('SUBMISSION_CLAIM_UNAVAILABLE', 'A Claim with reconciliation cannot be replaced by a corrected submission.')
    const previous = schemas.claim.safeParse(input.previousSourcePayload)
    if (previous.success && previous.data.applicantRecipientId === revised.applicantRecipientId
      && previous.data.fiscalYearId === revised.fiscalYearId && previous.data.isFinalForYear === revised.isFinalForYear
      && previous.data.periodStart === revised.periodStart && previous.data.periodEnd === revised.periodEnd
      && sameClaimSourceLines(previous.data.lineItems, revised.lineItems)) {
      await trx.updateTable('Funding_Case_Agreement_Claim').set({
        egcs_fc_customfields: answers,
        ...(previous.data.receivedDate !== revised.receivedDate
          ? { egcs_fc_receiveddate: new Date(`${revised.receivedDate}T00:00:00Z`) }
          : {})
      }).where('id', '=', targetId).executeTakeFirstOrThrow()
      return
    }
    if (!await isAgreementClaimProponentAvailable(trx, agreementId, revised.applicantRecipientId)) {
      await badRequest(event, 'AGREEMENT_CLAIM_PROPONENT_INVALID', 'apiErrors.agreement.invalid_claim_proponent')
    }
    await assertAgreementClaimBudgetFiscalYear(event, trx, agreementId, revised.fiscalYearId)
    await assertCurrencyMoneyValues(event, currency, revised.lineItems.map(line => line.amount))
    const existingLines = await readClaimLines(trx, targetId)
    const lineFunding = await readLineFunding(trx, target, existingLines)
    const matches = matchClaimSubmissionLines(existingLines.map(claimLineIdentity), revised.lineItems, 'revision')
    const matchedIndices = new Set(matches.values())
    if (existingLines.some((line, index) => !matchedIndices.has(index) && lineFunding.has(line.id))) {
      throw new SubmissionTargetError('SUBMISSION_CLAIM_LINE_IDENTITY', 'A funded Claim line could not be matched to the corrected submission.')
    }
    for (const [newIndex, oldIndex] of matches) {
      const oldLine = existingLines[oldIndex]
      const newLine = revised.lineItems[newIndex]
      if (!oldLine || !newLine || !lineFunding.has(oldLine.id)) continue
      if (oldLine.egcs_fc_sourcesubmissionlineid == null) {
        const budgetId = oldLine.egcs_fc_fundingagreementbudgetlineitem ?? null
        const oldGroup = existingLines.filter(line =>
          line.egcs_fc_sourcesubmissionlineid == null && (line.egcs_fc_fundingagreementbudgetlineitem ?? null) === budgetId)
        const newGroup = revised.lineItems.filter(line => line.sourceLineId === undefined && line.budgetLineItemId === budgetId)
        if (oldGroup.length > 1 || newGroup.length > 1) {
          throw new SubmissionTargetError('SUBMISSION_CLAIM_LINE_IDENTITY', 'A funded Claim line cannot be identified within an unkeyed budget group.')
        }
      }
      if (oldLine.egcs_fc_fundingagreementbudgetlineitem !== newLine.budgetLineItemId
        || oldLine.egcs_fc_currency !== currency || claim.egcs_fc_fiscalyear !== revised.fiscalYearId) {
        throw new SubmissionTargetError('SUBMISSION_CLAIM_LINE_FUNDING_SCOPE', 'A funded Claim line cannot move to another budget, year or currency.')
      }
    }
    for (const [index, line] of revised.lineItems.entries()) {
      const budgetId = line.budgetLineItemId
      if (!budgetId) continue
      await assertAgreementClaimBudgetLineItem(event, trx, agreementId, revised.fiscalYearId, budgetId)
      if (matches.has(index) || line.sourceLineId !== undefined
        || revised.lineItems.filter(candidate => candidate.budgetLineItemId === budgetId).length !== 1) continue
      const oldIndices = existingLines.flatMap((old, oldIndex) => old.egcs_fc_fundingagreementbudgetlineitem === budgetId ? [oldIndex] : [])
      const [oldIndex] = oldIndices
      if (oldIndices.length === 1 && oldIndex !== undefined && existingLines[oldIndex]?.egcs_fc_sourcesubmissionlineid == null) {
        matches.set(index, oldIndex)
        matchedIndices.add(oldIndex)
      }
    }
    await trx.updateTable('Funding_Case_Agreement_Claim').set({
      egcs_fc_customfields: answers,
      egcs_fc_applicantrecipient: revised.applicantRecipientId,
      egcs_fc_fiscalyear: revised.fiscalYearId,
      egcs_fc_isfinalforyear: revised.isFinalForYear,
      egcs_fc_periodstart: revised.periodStart,
      egcs_fc_periodend: revised.periodEnd,
      egcs_fc_receiveddate: new Date(`${revised.receivedDate}T00:00:00Z`)
    }).where('id', '=', targetId).executeTakeFirstOrThrow()
    for (const [index, line] of revised.lineItems.entries()) {
      const existingIndex = matches.get(index)
      const existing = existingIndex === undefined ? undefined : existingLines[existingIndex]
      const sources = existing ? lineFunding.get(existing.id) ?? [] : []
      const existingTotal = existing?.egcs_fc_currency === currency
        ? parseDatabaseMoney(existing.egcs_fc_totalamount, currency)
        : undefined
      let total = line.amount
      if (mode === 'automatic') {
        total = sumMoney([line.amount, ...sources.map(source => source.egcs_fc_amount)], currency)
      } else if (existing && existingTotal) {
        total = mode === 'manual'
          ? addMoney(line.amount, subtractMoney(existingTotal, parseDatabaseMoney(existing.egcs_fc_amount, currency)))
          : maxMoney([line.amount, existingTotal], currency)
      }
      if (!isPersistableMoney(total) || compareMoney(total, line.amount) < 0) {
        return await badRequest(event, 'AGREEMENT_FUNDING_TOTAL_MISMATCH', 'apiErrors.agreement.funding_breakdown_required')
      }
      const values = {
        egcs_fc_fundingagreementclaim: targetId,
        egcs_fc_fundingagreementbudgetlineitem: line.budgetLineItemId,
        egcs_fc_submittedcostcategory: line.submittedCostCategory,
        egcs_fc_submittedcostsubsection: line.submittedCostSubsection,
        egcs_fc_submittedlineitem: line.submittedLineItem,
        egcs_fc_description: line.description,
        egcs_fc_sourcesubmissionlineid: line.sourceLineId ?? null,
        egcs_fc_amount: databaseMoneyValue(line.amount),
        egcs_fc_totalamount: databaseMoneyValue(total),
        egcs_fc_currency: currency
      }
      if (existing) {
        await trx.updateTable('Funding_Case_Agreement_Claim_Line_Item').set(values).where('id', '=', existing.id).executeTakeFirstOrThrow()
      } else {
        await trx.insertInto('Funding_Case_Agreement_Claim_Line_Item').values(values).execute()
      }
    }
    for (const [index, line] of existingLines.entries()) {
      if (!matchedIndices.has(index)) await removeClaimLine(trx, line.id)
    }
  } else {
    const revised = await parseI18n(event, schemas.forecast, payload)
    const previous = await parseI18n(event, schemas.forecast, input.previousSourcePayload)
    const forecast = await readForecast(trx, input)
    if (!forecast || forecast.egcs_fc_fiscalyear !== revised.fiscalYearId) {
      return await badRequest(event, 'INVALID_AGREEMENT_FORECAST_FISCAL_YEAR', 'apiErrors.agreement.invalid_forecast_fiscal_year')
    }
    const recipient = await trx.selectFrom('Funding_Case_Agreement_Applicant_Recipient').select('id')
      .where('egcs_fc_fundingagreement', '=', agreementId).where('egcs_fc_applicantrecipient', '=', revised.applicantRecipientId)
      .where('_deleted', '=', false).executeTakeFirst()
    if (!recipient) return await badRequest(event, 'AGREEMENT_FORECAST_PROPONENT_INVALID', 'apiErrors.agreement.invalid_claim_proponent')
    await assertAgreementForecastBudgetFiscalYear(event, trx, agreementId, revised.fiscalYearId)
    const cellKeys = new Set(revised.lineItems.map(line => `${line.budgetLineItemId}:${line.month}`))
    if (cellKeys.size !== revised.lineItems.length) {
      throw new SubmissionTargetError('SUBMISSION_FORECAST_DUPLICATE_MONTH', 'The Forecast repeats a month on the same budget line.')
    }
    await assertCurrencyMoneyValues(event, currency, revised.lineItems.flatMap(line => line.totalAmount ? [line.amount, line.totalAmount] : [line.amount]))
    const remaining = await readForecastLines(trx, targetId)
    const lineFunding = await readLineFunding(trx, target, remaining)
    if (remaining.some(line => lineFunding.has(line.id)
      && !cellKeys.has(`${line.egcs_fc_fundingagreementbudgetlineitem}:${line.egcs_fc_month}`))) {
      throw new SubmissionTargetError('SUBMISSION_FORECAST_FUNDED_CELL_OMITTED', 'A funded Forecast cell is missing from the corrected submission.')
    }
    for (const line of revised.lineItems) {
      const matchesCell = (budgetId: string, month: number) => budgetId === line.budgetLineItemId && month === line.month
      const liveMatches = remaining.filter(old => matchesCell(old.egcs_fc_fundingagreementbudgetlineitem, old.egcs_fc_month))
      const existing = liveMatches.length === 1 ? liveMatches[0] : undefined
      const priorMatches = previous.lineItems.filter(old => matchesCell(old.budgetLineItemId, old.month))
      const prior = priorMatches.length === 1 ? priorMatches[0] : undefined
      const echoesPrior = prior && prior.amount.amount === line.amount.amount
        && prior.amount.currency === line.amount.currency
        && prior.totalAmount?.amount === line.totalAmount?.amount
        && prior.totalAmount?.currency === line.totalAmount?.currency
      const echoesReviewerCell = existing && priorMatches.length === 0
        && line.amount.amount === existing.egcs_fc_amount && line.totalAmount?.amount === existing.egcs_fc_totalamount
      if (existing) remaining.splice(remaining.indexOf(existing), 1)
      if (existing?.egcs_fc_currency === currency && (echoesPrior || echoesReviewerCell)) {
        const current = await readAgreementBudgetLineReference(trx, agreementId, forecast.egcs_fc_fiscalyear, line.budgetLineItemId, 'current-choice')
        if (!current) continue
      } else {
        await assertAgreementForecastBudgetLineItem(event, trx, agreementId, forecast.egcs_fc_fiscalyear, line.budgetLineItemId)
      }
      const sources = existing ? lineFunding.get(existing.id) ?? [] : []
      const calculated = sumMoney([line.amount, ...sources.map(source => source.egcs_fc_amount)], currency)
      let total: Money = line.totalAmount ?? calculated
      if (mode === 'program_only') {
        if (line.totalAmount) return await badRequest(event, 'AGREEMENT_FORECAST_TOTAL_COST_INVALID', 'apiErrors.agreement.total_cost_read_only')
        total = line.amount
      }
      if (!isPersistableMoney(total)) {
        return await badRequest(event, 'AGREEMENT_FORECAST_TOTAL_COST_INVALID', 'apiErrors.agreement.forecast_total_cost_range')
      }
      if (compareMoney(total, line.amount) < 0 || ((mode === 'automatic' || sources.length > 0) && compareMoney(total, calculated) !== 0)) {
        return await badRequest(event, 'AGREEMENT_FORECAST_TOTAL_COST_INVALID', 'apiErrors.agreement.funding_breakdown_required')
      }
      const values = {
        egcs_fc_agreementforecast: targetId,
        egcs_fc_fundingagreementbudgetlineitem: line.budgetLineItemId,
        egcs_fc_month: line.month,
        egcs_fc_amount: databaseMoneyValue(line.amount),
        egcs_fc_totalamount: databaseMoneyValue(total),
        egcs_fc_currency: currency
      }
      if (existing) {
        await trx.updateTable('Funding_Case_Agreement_Forecast_Line_Item').set(values).where('id', '=', existing.id).executeTakeFirstOrThrow()
      } else {
        await trx.insertInto('Funding_Case_Agreement_Forecast_Line_Item').values(values).execute()
      }
    }
    for (const line of remaining) {
      await trx.updateTable('Funding_Case_Agreement_Forecast_Line_Item').set({ _deleted: true })
        .where('id', '=', line.id).executeTakeFirstOrThrow()
    }
  }
  await assertAgreementFinancialBudgetControls(trx, agreementId, { kind: target, id: targetId })
}
