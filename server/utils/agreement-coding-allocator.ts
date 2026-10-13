/* eslint-disable jsdoc/require-param, jsdoc/require-returns, jsdoc/require-jsdoc -- Host allocation dispatch keeps its policy in narrow named helpers. */
import type { H3Event } from 'h3'
import { sql, type Kysely, type Transaction } from 'kysely'
import type { GcsCodingAllocator, GcsCodingAllocatorContext, GcsCodingAllocationCatalogLine, GcsCodingAllocationOutput } from '@gcs-ssc/extensions/server'
import { getGcsExtensions, loadGcsExtensionModule } from '#gcs-extensions/server-registry'
import type { Currency_Codes, Database } from '~~/shared/types/database'
import type { JsonValue, GcsExtensionJsonConfig } from '@gcs-ssc/extensions'
import { compareMoney, parseMoney, subtractMoney, sumMoney, type Money } from '~~/shared/utils/money'
import { throwApiError } from './api-errors'
import { getExtensionStreamConfiguration, handleExtensionCreateOperationError, isExtensionEnabledForAgency } from './extensions'
import { databaseMoneyText, databaseMoneyValue, parseDatabaseMoney } from './database-money'
import { getCommitmentAllocationPaidCoverage, getCommitmentLinePaymentCoverage, validateAgreementPaymentAllocations } from './agreement-commitment-line-balance'
import { hasAgreementPendingAllocationEffects } from './agreement-cost-allocation-context'
import { budgetFiscalYearStableId } from './agreement-budget-lineage'
import { hasPositiveCompletionTerminus } from './completion-terminus'

type DbClient = Kysely<Database> | Transaction<Database>
type ExistingAllocationLine = GcsCodingAllocatorContext['existingLines'][number]
export type AgreementCodingAllocation = GcsCodingAllocationCatalogLine & { amount: Money; allocationPolicy?: JsonValue }

const allocationError = async (event: H3Event, code: string): Promise<never> => await throwApiError(event, {
  statusCode: 409, code, key: 'apiErrors.agreement.invalid_coding_allocation'
})

/**
 * Validates exact totals, stream catalog membership, uniqueness, and aggregate paid floors.
 * @param amount - Declared financial transaction total.
 * @param catalog - Authoritative stream-selected catalog.
 * @param result - Untrusted extension allocation response.
 * @param existingLines - Existing commitment rows and host-provided paid floors.
 * @param codingPaidFloors - Aggregate shared coding floors for batch replacement.
 * @returns Validated allocations with authoritative catalog metadata.
 */
export const validateCodingAllocation = (
  amount: Money,
  catalog: GcsCodingAllocationCatalogLine[],
  result: unknown,
  existingLines: ExistingAllocationLine[] = [],
  codingPaidFloors: GcsCodingAllocatorContext['codingPaidFloors'] = []
): AgreementCodingAllocation[] => {
  if (!Array.isArray(result)) throw new Error('INVALID_CODING_ALLOCATION')
  const byId = new Map(catalog.map(line => [line.codingLineId, line]))
  const selected = new Set<string>()
  const allocations = result.map((value: unknown) => {
    if (!value || typeof value !== 'object' || !('codingLineId' in value) || !('amount' in value)
      || typeof value.codingLineId !== 'string' || typeof value.amount !== 'string') throw new Error('INVALID_CODING_ALLOCATION')
    const coding = byId.get(value.codingLineId)
    if (!coding || selected.has(value.codingLineId)) throw new Error('INVALID_CODING_ALLOCATION')
    selected.add(value.codingLineId)
    const allocated = parseMoney(value.amount)
    if (allocated !== value.amount || compareMoney(allocated, parseMoney('0')) < 0) throw new Error('INVALID_CODING_ALLOCATION')
    return { ...coding, amount: allocated }
  })
  if (compareMoney(sumMoney(allocations.map(line => line.amount)), amount) !== 0) throw new Error('INVALID_CODING_ALLOCATION')
  const proposed = new Map(allocations.map(line => [line.codingLineId, line.amount]))
  for (const codingId of new Set(existingLines.map(line => line.codingLineId))) {
    const paid = sumMoney(existingLines.filter(line => line.codingLineId === codingId).map(line => parseMoney(line.paidAmount)))
    if (compareMoney(proposed.get(codingId) ?? parseMoney('0'), paid) < 0) throw new Error('CODING_ALLOCATION_BELOW_PAID')
  }
  for (const floor of codingPaidFloors) {
    if (compareMoney(proposed.get(floor.codingLineId) ?? parseMoney('0'), parseMoney(floor.paidAmount)) < 0) throw new Error('CODING_ALLOCATION_BELOW_PAID')
  }
  return allocations
}

/** Reads Agency accounts solely for Agency-level configuration validation. */
export const readAgencyCodingCatalog = async (db: DbClient, input: {
  agencyId: string; currency: Currency_Codes; kind: 'commitment' | 'account_receivable' | 'credit_memo'; agencyFiscalYearId?: string
}): Promise<GcsCodingAllocationCatalogLine[]> => {
  let query = db.selectFrom('Agency_Chart_of_Account as account')
    .select(['account.id as codingLineId', 'account.id as agencyChartOfAccountId', 'account.egcs_ay_fiscalyear as agencyFiscalYearId',
      'account.egcs_ay_accountingdimensions as accountingDimensions', 'account.egcs_ay_commitmentchartofaccount as commitmentChartOfAccountId'])
    .where('account.egcs_ay_organizationagency', '=', input.agencyId).where('account.egcs_ay_currency', '=', input.currency)
    .where('account.egcs_ay_kind', '=', input.kind).where('account._deleted', '=', false).orderBy('account.id').forShare('account')
  if (input.agencyFiscalYearId) query = query.where('account.egcs_ay_fiscalyear', '=', input.agencyFiscalYearId)
  return (await query.execute()).map(line => ({ ...line, codingLineId: String(line.codingLineId),
    agencyChartOfAccountId: String(line.agencyChartOfAccountId), agencyFiscalYearId: String(line.agencyFiscalYearId),
    commitmentChartOfAccountId: line.commitmentChartOfAccountId ? String(line.commitmentChartOfAccountId) : null }))
}

/** Reads the authoritative Stream-selected account catalog for every financial output. */
export const readAgreementCodingCatalog = async (db: DbClient, input: {
  agencyId: string; streamId: string; currency: Currency_Codes
  kind: 'commitment' | 'account_receivable' | 'credit_memo'; agencyFiscalYearId?: string
}): Promise<GcsCodingAllocationCatalogLine[]> => {
  let catalogQuery = db.selectFrom('Transfer_Payment_Stream_Chart_of_Account as selection')
    .innerJoin('Agency_Chart_of_Account as account', 'account.id', 'selection.egcs_tp_agencychartofaccount')
    .select(['selection.id as codingLineId', 'account.id as agencyChartOfAccountId', 'account.egcs_ay_fiscalyear as agencyFiscalYearId',
      'account.egcs_ay_accountingdimensions as accountingDimensions', 'account.egcs_ay_commitmentchartofaccount as commitmentChartOfAccountId'])
    .where('selection.egcs_tp_transferpaymentstream', '=', input.streamId)
    .where('account.egcs_ay_organizationagency', '=', input.agencyId).where('account.egcs_ay_currency', '=', input.currency)
    .where('account.egcs_ay_kind', '=', input.kind).where('selection._deleted', '=', false).where('account._deleted', '=', false)
    .orderBy('selection.id').forShare('selection').forShare('account')
  if (input.agencyFiscalYearId) catalogQuery = catalogQuery.where('account.egcs_ay_fiscalyear', '=', input.agencyFiscalYearId)
  const catalog = (await catalogQuery.execute()).map(line => ({ ...line, codingLineId: String(line.codingLineId),
    agencyChartOfAccountId: String(line.agencyChartOfAccountId), agencyFiscalYearId: String(line.agencyFiscalYearId),
    commitmentChartOfAccountId: line.commitmentChartOfAccountId ? String(line.commitmentChartOfAccountId) : null }))
  return catalog
}

export const allocateAgreementCoding = async (
  event: H3Event,
  db: DbClient,
  input: {
    agreementId: string; agencyId: string; streamId: string; amount: Money; currency: Currency_Codes
    output: GcsCodingAllocationOutput; retainedPolicy?: JsonValue; retainedCatalog?: GcsCodingAllocationCatalogLine[]; retainedCatalogScope?: 'agency' | 'stream'; agencyFiscalYearId?: string; fiscalYearId?: string; existingLines?: ExistingAllocationLine[]; codingPaidFloors?: GcsCodingAllocatorContext['codingPaidFloors']; codingAvailableAmounts?: GcsCodingAllocatorContext['codingAvailableAmounts']
  }
): Promise<AgreementCodingAllocation[] | null> => {
  const providers = []
  for (const extension of await getGcsExtensions()) {
    if (!extension.codingAllocator || !await isExtensionEnabledForAgency(db, extension.key, input.agencyId)) continue
    const stream = extension.configurationScope === 'agency'
      ? { enabled: true, config: {} }
      : await getExtensionStreamConfiguration(db, extension.key, input.streamId)
    if (!stream.enabled) continue
    const agency = await db.selectFrom('extensions.agency_enablement').select('config')
      .where('extension_key', '=', extension.key).where('agency_id', '=', input.agencyId)
      .where('_deleted', '=', false).executeTakeFirstOrThrow()
    providers.push({ contribution: extension.codingAllocator, config: stream.config, agencyConfig: agency.config as GcsExtensionJsonConfig })
  }
  if (!providers.length) return null
  if (providers.length > 1) return await allocationError(event, 'CODING_ALLOCATOR_CONFLICT')
  const provider = providers[0]!
  let agencyFiscalYearId = input.agencyFiscalYearId
  if (input.output.kind === 'payment' && input.fiscalYearId) {
    const year = await db.selectFrom('Funding_Case_Agreement_Budget_Fiscal_Year')
      .innerJoin('Funding_Case_Agreement_Budget_Version', 'Funding_Case_Agreement_Budget_Version.id', 'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_budgetversion')
      .select('Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fiscalyear as agencyFiscalYearId')
      .where(budgetFiscalYearStableId, '=', input.fiscalYearId)
      .where('Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fundingagreement', '=', input.agreementId)
      .where('Funding_Case_Agreement_Budget_Fiscal_Year._deleted', '=', false)
      .where('Funding_Case_Agreement_Budget_Version.egcs_fc_iscurrent', '=', true)
      .where('Funding_Case_Agreement_Budget_Version._deleted', '=', false).executeTakeFirstOrThrow()
    agencyFiscalYearId = String(year.agencyFiscalYearId)
  }
  const kind = input.output.kind === 'receivable' ? 'account_receivable' : input.output.kind === 'credit-memo' ? 'credit_memo' : 'commitment'
  const liveCatalog = await readAgreementCodingCatalog(db, { ...input, kind,
    agencyFiscalYearId: kind === 'credit_memo' ? undefined : agencyFiscalYearId })
  const catalog = input.retainedCatalog
    ? input.retainedCatalog.map(retained => {
        const live = liveCatalog.find(candidate => candidate.agencyChartOfAccountId === retained.agencyChartOfAccountId
          && candidate.agencyFiscalYearId === retained.agencyFiscalYearId
          && (input.retainedCatalogScope === 'agency' || candidate.codingLineId === retained.codingLineId))
        return live ? { ...retained, codingLineId: live.codingLineId } : null
      }).filter(line => line !== null)
    : liveCatalog
  if (input.retainedCatalog && catalog.length !== input.retainedCatalog.length) return await allocationError(event, 'INVALID_CODING_ALLOCATION')
  const commitmentCatalog = kind === 'commitment' && !agencyFiscalYearId
    ? catalog
    : (await db.selectFrom('Transfer_Payment_Stream_Chart_of_Account as selection')
        .innerJoin('Agency_Chart_of_Account as account', 'account.id', 'selection.egcs_tp_agencychartofaccount')
        .select(['selection.id as codingLineId', 'account.id as agencyChartOfAccountId', 'account.egcs_ay_fiscalyear as agencyFiscalYearId',
          'account.egcs_ay_accountingdimensions as accountingDimensions'])
        .where('selection.egcs_tp_transferpaymentstream', '=', input.streamId).where('account.egcs_ay_organizationagency', '=', input.agencyId)
        .where('account.egcs_ay_currency', '=', input.currency).where('account.egcs_ay_kind', '=', 'commitment')
        .where('selection._deleted', '=', false).where('account._deleted', '=', false).orderBy('selection.id')
        .forShare('selection').forShare('account').execute()).map(line => ({ ...line, codingLineId: String(line.codingLineId),
        agencyChartOfAccountId: String(line.agencyChartOfAccountId), agencyFiscalYearId: String(line.agencyFiscalYearId) }))
  let result: unknown
  let output: GcsCodingAllocationOutput = input.output.kind === 'receivable'
    ? { ...input.output, fiscalYearId: input.output.fiscalYearId ?? input.agencyFiscalYearId }
    : input.output
  if (output.kind === 'credit-memo') {
    const commitments = await db.selectFrom('Funding_Case_Agreement_Commitment as commitment')
      .innerJoin('Common_Completion as completion', 'completion.egcs_cn_entityid', 'commitment.id')
      .select(['commitment.id as commitmentId', 'commitment.egcs_fc_type as commitmentTypeId'])
      .where('commitment.egcs_fc_fundingagreement', '=', input.agreementId)
      .where('commitment.egcs_fc_currency', '=', input.currency).where('commitment.egcs_fc_active', '=', true)
      .where('commitment._deleted', '=', false).where('completion._deleted', '=', false)
      .where('completion.egcs_cn_entitytype', '=', 'fundingcaseagreementcommitment')
      .orderBy('completion.egcs_cn_completedat', 'desc').orderBy('completion.id', 'desc')
      .forShare('commitment').forShare('completion').execute()
    const activeCommitments: Array<{ commitmentId: string; commitmentTypeId: string }> = []
    for (const commitment of commitments) {
      if (await hasPositiveCompletionTerminus(db, 'fundingcaseagreementcommitment', String(commitment.commitmentId))) {
        activeCommitments.push({ commitmentId: String(commitment.commitmentId), commitmentTypeId: String(commitment.commitmentTypeId) })
      }
    }
    output = { ...output, activeCommitments }
  }
  try {
    const module = await loadGcsExtensionModule(provider.contribution.id) as { default?: GcsCodingAllocator }
    if (typeof module.default !== 'function') throw new Error('INVALID_CODING_ALLOCATION')
    result = await module.default({ ...input, output, db: db as Transaction<unknown>, codingAvailableAmounts: input.codingAvailableAmounts ?? [], codingLines: catalog, commitmentCodingLines: commitmentCatalog, existingLines: input.existingLines ?? [], codingPaidFloors: input.codingPaidFloors ?? [],
      config: provider.config, agencyConfig: provider.agencyConfig })
  } catch (error) {
    await handleExtensionCreateOperationError(event, error)
  }
  if (result === null) return null
  if (input.output.kind === 'commitment'
    && await hasAgreementPendingAllocationEffects(db, input.agreementId)) {
    return await allocationError(event, 'COST_ALLOCATION_PENDING_EFFECTS')
  }
  try {
    const envelope = !Array.isArray(result) && result && typeof result === 'object' && 'lines' in result ? result : null
    return validateCodingAllocation(input.amount, catalog, envelope ? envelope.lines : result, input.output.kind === 'commitment' ? input.existingLines : [],
      input.output.kind === 'commitment' ? input.codingPaidFloors : []).map(line => ({ ...line,
      ...(envelope && 'policy' in envelope ? { allocationPolicy: envelope.policy as JsonValue } : {}) }))
  } catch (error) {
    return await allocationError(event, error instanceof Error && error.message === 'CODING_ALLOCATION_BELOW_PAID' ? error.message : 'INVALID_CODING_ALLOCATION')
  }
}

export const allocateAgreementCommitment = async (
  event: H3Event, trx: Transaction<Database>,
  input: { agreementId: string; agencyId: string; streamId: string; commitmentId: string; commitmentTypeId: string; amount: Money; currency: Currency_Codes }
): Promise<boolean> => {
  const existing = await trx.selectFrom('Funding_Case_Agreement_Commitment_Line')
    .select(['id', 'egcs_fc_commitmentlinenumber', 'egcs_fc_transferpaymentstreamchartofaccount', databaseMoneyText(sql.ref('egcs_fc_amount')).as('amount')])
    .where('egcs_fc_commitment', '=', input.commitmentId).where('_deleted', '=', false).orderBy('id').forUpdate().execute()
  const previous = await trx.selectFrom('Funding_Case_Agreement_Commitment_Line as previousLine')
    .innerJoin('Funding_Case_Agreement_Commitment as previousCommitment', 'previousCommitment.id', 'previousLine.egcs_fc_commitment')
    .select(['previousLine.id', 'previousLine.egcs_fc_transferpaymentstreamchartofaccount as codingLineId',
      databaseMoneyText(sql.ref('previousLine.egcs_fc_amount')).as('amount')])
    .where('previousCommitment.egcs_fc_fundingagreement', '=', input.agreementId).where('previousCommitment.egcs_fc_type', '=', input.commitmentTypeId)
    .where('previousCommitment.egcs_fc_currency', '=', input.currency).where('previousCommitment.egcs_fc_active', '=', true)
    .where('previousCommitment.id', '!=', input.commitmentId).where('previousCommitment._deleted', '=', false)
    .where('previousLine._deleted', '=', false).orderBy('previousLine.id').forUpdate('previousLine').execute()
  const coverage = await getCommitmentAllocationPaidCoverage(trx, { agreementId: input.agreementId, currency: input.currency,
    lineIds: [...existing, ...previous].map(line => String(line.id)), commitmentTypeId: input.commitmentTypeId })
  const existingLines = existing.map(line => ({ id: String(line.id), codingLineId: String(line.egcs_fc_transferpaymentstreamchartofaccount),
    amount: parseDatabaseMoney(line.amount), ...coverage.lines.get(String(line.id))! }))
  const priorLines = previous.map(line => ({ id: String(line.id), codingLineId: String(line.codingLineId),
    amount: parseDatabaseMoney(line.amount), ...coverage.lines.get(String(line.id))! }))
  const allocations = await allocateAgreementCoding(event, trx, { ...input, output: { kind: 'commitment', commitmentId: input.commitmentId, commitmentTypeId: input.commitmentTypeId },
    existingLines: [...existingLines, ...priorLines], codingPaidFloors: [...coverage.codingFloors].map(([codingLineId, paidAmount]) => ({ codingLineId, paidAmount })) })
  if (!allocations) return false
  let nextNumber = Math.max(0, ...existing.map(line => line.egcs_fc_commitmentlinenumber))
  const remaining = new Map(allocations.map(line => [line.codingLineId, line.amount]))
  // Preserve every paid row before assigning the remainder to an existing row or a new one.
  const firstByCoding = new Set<string>()
  for (const line of existingLines) {
    const sameCoding = existingLines.filter(candidate => candidate.codingLineId === line.codingLineId)
    let allocated = parseMoney(line.paidAmount)
    if (!firstByCoding.has(line.codingLineId)) {
      firstByCoding.add(line.codingLineId)
      allocated = subtractMoney(remaining.get(line.codingLineId) ?? parseMoney('0'), sumMoney(sameCoding.filter(candidate => candidate.id !== line.id).map(candidate => parseMoney(candidate.paidAmount))))
      remaining.delete(line.codingLineId)
    }
    const explicitlySelected = allocations.some(allocation => allocation.codingLineId === line.codingLineId)
    const deleted = compareMoney(allocated, parseMoney('0')) === 0 && !line.hasActivePaymentLine && !explicitlySelected
    await trx.updateTable('Funding_Case_Agreement_Commitment_Line').set({ egcs_fc_amount: databaseMoneyValue(allocated), _deleted: deleted }).where('id', '=', line.id).execute()
  }
  for (const [codingId, amount] of remaining) {
    nextNumber += 1
    if (nextNumber > 32767) return await allocationError(event, 'INVALID_CODING_ALLOCATION')
    await trx.insertInto('Funding_Case_Agreement_Commitment_Line').values({ egcs_fc_commitment: input.commitmentId,
      egcs_fc_commitmentlinenumber: nextNumber, egcs_fc_transferpaymentstreamchartofaccount: codingId, egcs_fc_amount: databaseMoneyValue(amount) }).execute()
  }
  return true
}

export const allocateAgreementPayment = async (
  event: H3Event, trx: Transaction<Database>,
  input: { agreementId: string; agencyId: string; streamId: string; paymentId: string; commitmentId: string; commitmentTypeId: string; amount: Money; currency: Currency_Codes; fiscalYearId: string }
): Promise<boolean> => {
  const lines = await trx.selectFrom('Funding_Case_Agreement_Commitment_Line').select(['id', 'egcs_fc_transferpaymentstreamchartofaccount', databaseMoneyText(sql.ref('egcs_fc_amount')).as('amount')])
    .where('egcs_fc_commitment', '=', input.commitmentId).where('_deleted', '=', false).orderBy('id').forUpdate().execute()
  const coverage = await getCommitmentAllocationPaidCoverage(trx, { agreementId: input.agreementId, currency: input.currency,
    lineIds: lines.map(line => String(line.id)), excludePaymentId: input.paymentId, commitmentTypeId: input.commitmentTypeId })
  const existingLines = lines.map(line => ({ id: String(line.id), codingLineId: String(line.egcs_fc_transferpaymentstreamchartofaccount),
    amount: parseDatabaseMoney(line.amount), paidAmount: coverage.lines.get(String(line.id))!.paidAmount }))
  const codingAvailableAmounts = [...new Set(existingLines.map(line => line.codingLineId))].map(codingLineId => {
    const amount = subtractMoney(sumMoney(existingLines.filter(line => line.codingLineId === codingLineId).map(line => line.amount)),
      coverage.codingFloors.get(codingLineId) ?? parseMoney('0'))
    return { codingLineId, amount: compareMoney(amount, parseMoney('0')) < 0 ? parseMoney('0') : amount }
  })
  const allocated = await allocateAgreementCoding(event, trx, { ...input,
    output: { kind: 'payment', commitmentId: input.commitmentId, commitmentTypeId: input.commitmentTypeId, fiscalYearId: input.fiscalYearId },
    existingLines, codingPaidFloors: [...coverage.codingFloors].map(([codingLineId, paidAmount]) => ({ codingLineId, paidAmount })), codingAvailableAmounts })
  if (!allocated) return false
  const allocations = []
  for (const row of allocated) {
    const candidates = lines.filter(line => String(line.egcs_fc_transferpaymentstreamchartofaccount) === row.codingLineId)
    let remaining = row.amount
    for (const candidate of candidates) {
      const coverage = await getCommitmentLinePaymentCoverage(trx, String(candidate.id), { excludePaymentId: input.paymentId, currency: input.currency })
      const capacity = subtractMoney(parseDatabaseMoney(candidate.amount), coverage.paidAmount)
      if (compareMoney(capacity, parseMoney('0')) <= 0) continue
      const amount = compareMoney(remaining, capacity) > 0 ? capacity : remaining
      if (compareMoney(amount, parseMoney('0')) > 0) allocations.push({ commitmentLineId: String(candidate.id), amount })
      remaining = subtractMoney(remaining, amount)
      if (compareMoney(remaining, parseMoney('0')) === 0) break
    }
    if (compareMoney(remaining, parseMoney('0')) !== 0) return await allocationError(event, 'INVALID_CODING_ALLOCATION')
  }
  if (!await validateAgreementPaymentAllocations(trx, input.agreementId, allocations, { currency: input.currency, excludePaymentId: input.paymentId })) {
    return await allocationError(event, 'INVALID_CODING_ALLOCATION')
  }
  await trx.updateTable('Funding_Case_Agreement_Payment_Line').set({ _deleted: true })
    .where('egcs_fc_fundingagreementpayment', '=', input.paymentId).where('_deleted', '=', false).execute()
  for (const allocation of allocations) await trx.insertInto('Funding_Case_Agreement_Payment_Line').values({
    egcs_fc_fundingagreementpayment: input.paymentId, egcs_fc_fundingagreementcommitmentline: allocation.commitmentLineId,
    egcs_fc_amount: databaseMoneyValue(parseMoney(allocation.amount)) }).execute()
  return true
}
