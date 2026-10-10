/* eslint-disable jsdoc/require-jsdoc -- Host allocation dispatch keeps its policy in narrow named helpers. */
import type { H3Event } from 'h3'
import { sql, type Kysely, type Transaction } from 'kysely'
import type { GcsCodingAllocator, GcsCodingAllocatorContext, GcsCodingAllocationCatalogLine, GcsCodingAllocationOutput } from '@gcs-ssc/extensions/server'
import { getGcsExtensions, loadGcsExtensionModule } from '#gcs-extensions/server-registry'
import type { Currency_Codes, Database } from '~~/shared/types/database'
import type { GcsExtensionJsonConfig } from '@gcs-ssc/extensions'
import { compareMoney, parseMoney, subtractMoney, sumMoney, type Money } from '~~/shared/utils/money'
import { throwApiError } from './api-errors'
import { getExtensionStreamConfiguration, handleExtensionCreateOperationError, isExtensionEnabledForAgency } from './extensions'
import { databaseMoneyText, databaseMoneyValue, parseDatabaseMoney } from './database-money'
import { getCommitmentAllocationPaidCoverage, getCommitmentLinePaymentCoverage, validateAgreementPaymentAllocations } from './agreement-commitment-line-balance'
import { budgetFiscalYearStableId } from './agreement-budget-lineage'

type DbClient = Kysely<Database> | Transaction<Database>
type ExistingAllocationLine = GcsCodingAllocatorContext['existingLines'][number]
export type AgreementCodingAllocation = GcsCodingAllocationCatalogLine & { amount: Money }

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

export const allocateAgreementCoding = async (
  event: H3Event,
  db: DbClient,
  input: {
    agreementId: string; agencyId: string; streamId: string; amount: Money; currency: Currency_Codes
    output: GcsCodingAllocationOutput; agencyFiscalYearId?: string; fiscalYearId?: string; existingLines?: ExistingAllocationLine[]; codingPaidFloors?: GcsCodingAllocatorContext['codingPaidFloors']
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
  let catalogQuery = db.selectFrom('Transfer_Payment_Stream_Chart_of_Account as selection')
    .innerJoin('Agency_Chart_of_Account as account', 'account.id', 'selection.egcs_tp_agencychartofaccount')
    .select(['selection.id as codingLineId', 'account.id as agencyChartOfAccountId', 'account.egcs_ay_fiscalyear as agencyFiscalYearId',
      'account.egcs_ay_accountingdimensions as accountingDimensions', 'account.egcs_ay_commitmentchartofaccount as commitmentChartOfAccountId'])
    .where('selection.egcs_tp_transferpaymentstream', '=', input.streamId)
    .where('account.egcs_ay_organizationagency', '=', input.agencyId).where('account.egcs_ay_currency', '=', input.currency)
    .where('account.egcs_ay_kind', '=', kind).where('selection._deleted', '=', false).where('account._deleted', '=', false)
    .orderBy('selection.id').forShare('selection').forShare('account')
  if (agencyFiscalYearId) catalogQuery = catalogQuery.where('account.egcs_ay_fiscalyear', '=', agencyFiscalYearId)
  const catalog = (await catalogQuery.execute()).map(line => ({ ...line, codingLineId: String(line.codingLineId),
    agencyChartOfAccountId: String(line.agencyChartOfAccountId), agencyFiscalYearId: String(line.agencyFiscalYearId),
    commitmentChartOfAccountId: line.commitmentChartOfAccountId ? String(line.commitmentChartOfAccountId) : null }))
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
  try {
    const module = await loadGcsExtensionModule(provider.contribution.id) as { default?: GcsCodingAllocator }
    if (typeof module.default !== 'function') throw new Error('INVALID_CODING_ALLOCATION')
    result = await module.default({ ...input, codingLines: catalog, commitmentCodingLines: commitmentCatalog, existingLines: input.existingLines ?? [], codingPaidFloors: input.codingPaidFloors ?? [],
      config: provider.config, agencyConfig: provider.agencyConfig })
  } catch (error) {
    await handleExtensionCreateOperationError(event, error)
  }
  try {
    return validateCodingAllocation(input.amount, catalog, result, input.output.kind === 'commitment' ? input.existingLines : [],
      input.output.kind === 'commitment' ? input.codingPaidFloors : [])
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
    lineIds: [...existing, ...previous].map(line => String(line.id)) })
  const existingLines = existing.map(line => ({ id: String(line.id), codingLineId: String(line.egcs_fc_transferpaymentstreamchartofaccount),
    amount: parseDatabaseMoney(line.amount), ...coverage.lines.get(String(line.id))! }))
  const priorLines = previous.map(line => ({ id: String(line.id), codingLineId: String(line.codingLineId),
    amount: parseDatabaseMoney(line.amount), ...coverage.lines.get(String(line.id))! }))
  const allocations = await allocateAgreementCoding(event, trx, { ...input, output: { kind: 'commitment', commitmentTypeId: input.commitmentTypeId },
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
  input: { agreementId: string; agencyId: string; streamId: string; paymentId: string; commitmentId: string; amount: Money; currency: Currency_Codes; fiscalYearId: string }
): Promise<boolean> => {
  const allocated = await allocateAgreementCoding(event, trx, { ...input, output: { kind: 'payment' } })
  if (!allocated) return false
  const lines = await trx.selectFrom('Funding_Case_Agreement_Commitment_Line').select(['id', 'egcs_fc_transferpaymentstreamchartofaccount', databaseMoneyText(sql.ref('egcs_fc_amount')).as('amount')])
    .where('egcs_fc_commitment', '=', input.commitmentId).where('_deleted', '=', false).orderBy('id').forUpdate().execute()
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
