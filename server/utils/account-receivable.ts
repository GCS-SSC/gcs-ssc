import { readAccountReceivableCashBalance } from './account-receivable-cash-balance'
/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns -- AR aggregate domain, retained reads and exact assigned writes. */
import type { H3Event } from 'h3'
import { readAccountReceivableType, readAccountReceivableAccount } from './account-receivable-configuration'
import { assertAccountReceivableSourceOrigin } from './account-receivable-source-entry'
import { sql, type Kysely, type Transaction } from 'kysely'
import type { Database, JsonValue } from '~~/shared/types/database'
import type { AccountReceivableCreate, AccountReceivableEdit, AccountReceivableSummaryEdit } from '~~/shared/types/schemas/account-receivable'
import { moneyToCents, parseMoney, subtractMoney, sumMoney, type Money } from '~~/shared/utils/money'
import { allocateAccountReceivableCoding } from '~~/shared/utils/account-receivable'
import { hasAccountReceivablePoolLedger } from './account-receivable-pool-ledger'
import { authorize, authorizeFreshAssignedItem, requireAuthContext } from './authorize'
import { resolveAgreementScopeContext } from './agreement'
import { assertAgreementFinancialId } from './agreement-financial-ids'
import { forbidden, notFound } from './api-errors'
import { createPrimaryEntityAssignment, resolveAssignmentCommonUserId } from './entity-assignment'
import { lockAgencyDraftStatus } from './business-status-runtime'
import { resolveCompletionEvidenceId } from './completion-runtime-core'
import { databaseMoneyText, databaseMoneyValue, parseDatabaseMoney } from './database-money'
import { canAccessApplicantRecipient } from './applicant-recipient-auth'
import { withBusinessRecordState } from './business-record-state'
import { resolveAssignedItemTargetGrant } from './rbac'
import { accountReceivableSourceUsage, accountReceivableAdvanceUsage, executeFreshAccountReceivableWrite, resolveAccountReceivableRuntimeContext } from './account-receivable-context'
import { accountReceivableError, readAccountReceivableSources, requireAccountReceivableSourceRead, type CapturedAccountReceivableSource } from './account-receivable-source'

const ZERO = parseMoney('0.00')
const json = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value)) as JsonValue

export const authorizeAccountReceivableAgreement = async (event: H3Event, agreementId: string, action: 'read' | 'create' = 'read') => {
  const context = await resolveAgreementScopeContext(agreementId, event.context.$db)
  if (!context) return await notFound(event, 'ACCOUNT_RECEIVABLE_NOT_FOUND', 'apiErrors.account_receivable.not_found')
  await authorize(event, 'account_receivable', action, context.scope)
  return context
}

export const authorizeAccountReceivable = async (event: H3Event, id: string, action: 'read' | 'update' | 'delete' = 'read') => {
  const context = await resolveAccountReceivableRuntimeContext(event.context.$db, id)
  if (!context) return await notFound(event, 'ACCOUNT_RECEIVABLE_NOT_FOUND', 'apiErrors.account_receivable.not_found')
  await authorize(event, 'account_receivable', action, context.scope)
  return context
}

export const readAccountReceivableLines = async (db: Kysely<Database>, id: string) => {
  const lines = await db.selectFrom('Funding_Case_Agreement_Account_Receivable_Line').selectAll()
    .select([databaseMoneyText(sql.ref('egcs_fc_amount')).as('egcs_fc_amount'), databaseMoneyText(sql.ref('egcs_fc_sourceamount')).as('egcs_fc_sourceamount')])
    .where('egcs_fc_receivable', '=', id).where('_deleted', '=', false).orderBy('egcs_fc_periodstart').orderBy('id').execute()
  return lines.map(line => ({ ...line, egcs_fc_amount: parseDatabaseMoney(line.egcs_fc_amount), egcs_fc_sourceamount: parseDatabaseMoney(line.egcs_fc_sourceamount) }))
}

export const readAccountReceivableCoding = async (db: Kysely<Database>, id: string) => {
  const rows = await db.selectFrom('Funding_Case_Agreement_Account_Receivable_Coding').selectAll()
    .select([databaseMoneyText(sql.ref('egcs_fc_amount')).as('egcs_fc_amount'), databaseMoneyText(sql.ref('egcs_fc_paidbasis')).as('egcs_fc_paidbasis'), databaseMoneyText(sql.ref('egcs_fc_sharedpaidbasis')).as('egcs_fc_sharedpaidbasis')])
    .where('egcs_fc_receivable', '=', id).where('_deleted', '=', false).orderBy('id').execute()
  return rows.map(row => ({ ...row, egcs_fc_amount: parseDatabaseMoney(row.egcs_fc_amount), egcs_fc_paidbasis: parseDatabaseMoney(row.egcs_fc_paidbasis), egcs_fc_sharedpaidbasis: parseDatabaseMoney(row.egcs_fc_sharedpaidbasis) }))
}

/** Effective balances count signed adjustments once and successful principal allocations once. */
export const readAccountReceivableLineBalances = async (db: Kysely<Database>, id: string) => {
  const lines = await readAccountReceivableLines(db, id)
  const adjustments = await db.selectFrom('Funding_Case_Agreement_Account_Receivable_Line as line')
    .innerJoin('Funding_Case_Agreement_Account_Receivable as debt', 'debt.id', 'line.egcs_fc_receivable')
    .select(['line.egcs_fc_originalline', databaseMoneyText(sql.ref('line.egcs_fc_amount')).as('amount')])
    .where('debt.egcs_fc_linkedreceivable', '=', id).where('debt.egcs_fc_outcome', '=', 'posted')
    .where('debt._deleted', '=', false).where('line._deleted', '=', false).execute()
  const allocations = await db.selectFrom('Funding_Case_Account_Receivable_Allocation as allocation')
    .innerJoin('Funding_Case_Account_Receivable_Recovery as recovery', 'recovery.id', 'allocation.egcs_fc_recovery')
    .select(['allocation.egcs_fc_receivableline', 'recovery.egcs_fc_outcome', databaseMoneyText(sql.ref('allocation.egcs_fc_amount')).as('amount')])
    .where('allocation.egcs_fc_receivable', '=', id).where('allocation._deleted', '=', false).where('recovery._deleted', '=', false)
    .where('recovery.egcs_fc_outcome', 'in', ['open', 'posted']).execute()
  const debt = await db.selectFrom('Funding_Case_Agreement_Account_Receivable').select('egcs_fc_outcome').where('id', '=', id).executeTakeFirstOrThrow()
  return lines.map(line => {
    const principal = debt.egcs_fc_outcome === 'posted'
      ? sumMoney([line.egcs_fc_amount, ...adjustments
          .filter(row => String(row.egcs_fc_originalline) === String(line.id)).map(row => parseDatabaseMoney(row.amount))])
      : ZERO
    const matching = allocations.filter(row => String(row.egcs_fc_receivableline) === String(line.id))
    const recovered = sumMoney(matching.filter(row => row.egcs_fc_outcome === 'posted').map(row => parseDatabaseMoney(row.amount)))
    const reserved = sumMoney(matching.filter(row => row.egcs_fc_outcome === 'open').map(row => parseDatabaseMoney(row.amount)))
    return { ...line, egcs_fc_principal: principal, egcs_fc_recovered: recovered, egcs_fc_reserved: reserved,
      egcs_fc_outstanding: subtractMoney(principal, recovered), egcs_fc_available: subtractMoney(subtractMoney(principal, recovered), reserved) }
  })
}

export const assertAccountReceivableEditable = async (event: H3Event, trx: Transaction<Database>, id: string) => {
  const row = await trx.selectFrom('Funding_Case_Agreement_Account_Receivable as debt')
    .innerJoin('Common_Status as status', 'status.id', 'debt.egcs_fc_status').selectAll('debt')
    .select(['status.egcs_cn_terminal', 'status.egcs_cn_readonly', 'status.egcs_cn_isdraft', 'status.egcs_cn_agency'])
    .where('debt.id', '=', id).where('debt._deleted', '=', false).where('status._deleted', '=', false).forUpdate(['debt', 'status']).executeTakeFirstOrThrow()
  if (row.egcs_fc_outcome !== 'open' || row.egcs_cn_terminal || row.egcs_cn_readonly
    || await resolveCompletionEvidenceId(trx, row.egcs_fc_entitytype, id)) return await accountReceivableError(event, 'AR_IMMUTABLE')
  return row
}

/** Stable proportional cents, with retained positive paid capacity and no fabricated coding. */
export const allocateRetainedAccountReceivableCoding = (amount: Money, coding: Array<{ id: string; basis: Money; capacity: Money }>) =>
  allocateAccountReceivableCoding(amount, coding.map(row => ({ id: row.id, egcs_fc_weight: row.basis, egcs_fc_capacity: row.capacity })))
    .map(row => ({ id: row.id, amount: row.egcs_fc_amount }))

/** The latest posted linked adjustment defines the approved policy for the original debt. */
export const readAccountReceivableApprovedRecoveryMethod = async (db: Kysely<Database>, id: string) => {
  const header = await db.selectFrom('Funding_Case_Agreement_Account_Receivable')
    .select(['id', 'egcs_fc_linkedreceivable', 'egcs_fc_recoverymethod']).where('id', '=', id).executeTakeFirstOrThrow()
  const root = header.egcs_fc_linkedreceivable
    ? await db.selectFrom('Funding_Case_Agreement_Account_Receivable')
        .select(['id', 'egcs_fc_recoverymethod']).where('id', '=', String(header.egcs_fc_linkedreceivable)).executeTakeFirstOrThrow()
    : header
  const adjustment = await db.selectFrom('Funding_Case_Agreement_Account_Receivable').select('egcs_fc_recoverymethod')
    .where('egcs_fc_linkedreceivable', '=', String(root.id)).where('egcs_fc_outcome', '=', 'posted').where('_deleted', '=', false)
    .orderBy('egcs_fc_postedat', 'desc').orderBy('id', 'desc').executeTakeFirst()
  return adjustment?.egcs_fc_recoverymethod ?? root.egcs_fc_recoverymethod
}

export const fiscalCapacity = (sources: CapturedAccountReceivableSource[], advanceRelated: boolean): Money | null => {
  if (!advanceRelated) return null
  const amount = (sources[0]?.egcs_fc_evidence as Record<string, JsonValue> | undefined)?.egcs_fc_fiscaloutstanding
  return typeof amount === 'string' ? parseMoney(amount) : ZERO
}
export const freshCoding = (sources: CapturedAccountReceivableSource[] | null, sourceKey: string | undefined,
  partition: { egcs_fc_commitmentline: string; egcs_fc_chartofaccount: string; egcs_fc_agencyfiscalyear: string; egcs_fc_periodstart: number; egcs_fc_periodend: number }) => sources?.find(source => source.id === sourceKey)?.coding.find(row =>
  row.egcs_fc_commitmentline === String(partition.egcs_fc_commitmentline) && row.egcs_fc_chartofaccount === String(partition.egcs_fc_chartofaccount)
  && row.egcs_fc_agencyfiscalyear === String(partition.egcs_fc_agencyfiscalyear) && row.egcs_fc_periodstart === partition.egcs_fc_periodstart && row.egcs_fc_periodend === partition.egcs_fc_periodend)

export const validateAccountReceivableBasis = async (trx: Kysely<Database>, id: string, options: { submission?: boolean } = {}) => {
  const debt = await trx.selectFrom('Funding_Case_Agreement_Account_Receivable').selectAll()
    .select([sql<string | null>`egcs_fc_fiscaloutstanding::text`.as('egcs_fc_fiscaloutstanding'), databaseMoneyText(sql.ref('egcs_fc_amount')).as('egcs_fc_amount')]).where('id', '=', id).where('_deleted', '=', false).executeTakeFirstOrThrow()
  if (debt.egcs_fc_linkedreceivable) {
    const financial = debt.egcs_fc_agencyfinancialid
      ? await trx.selectFrom('Applicant_Recipient_Agency_Financial_Id')
          .select('id').where('id', '=', String(debt.egcs_fc_agencyfinancialid)).where('egcs_ar_active', '=', true).where('_deleted', '=', false).executeTakeFirst()
      : null
    if (!financial) throw new Error('AR_FINANCIAL_ID_UNAVAILABLE')
  }
  const lines = await readAccountReceivableLines(trx, id)
  const total = sumMoney(lines.map(line => line.egcs_fc_amount))
  if (!lines.length && options.submission && !debt.egcs_fc_linkedreceivable) throw new Error('AR_LINES_REQUIRED')
  if (options.submission && !debt.egcs_fc_linkedreceivable && total !== parseDatabaseMoney(debt.egcs_fc_amount)) throw new Error('AR_CODING_TOTAL')
  if (debt.egcs_fc_claimrelated === debt.egcs_fc_advancepaymentrelated) throw new Error('AR_TYPE_FLAGS_INVALID')
  if (debt.egcs_fc_monitorrequired !== Boolean(debt.egcs_fc_monitorfollowup)) throw new Error('AR_MONITOR_REQUIRED')
  if (options.submission && !debt.egcs_fc_recoverymethod) throw new Error('AR_RECOVERY_METHOD_REQUIRED')
  if (options.submission && debt.egcs_fc_advancepaymentrelated && debt.egcs_fc_fiscaloutstanding === null) throw new Error('AR_SOURCE_CAPACITY')
  if (options.submission && !debt.egcs_fc_narrative_en.trim() && !debt.egcs_fc_narrative_fr.trim()) throw new Error('AR_RATIONALE_REQUIRED')
  if (options.submission && debt.egcs_fc_recipientpreference && debt.egcs_fc_recipientpreference !== debt.egcs_fc_recoverymethod
    && !debt.egcs_fc_preferenceoverride_en.trim() && !debt.egcs_fc_preferenceoverride_fr.trim()) throw new Error('AR_OVERRIDE_REQUIRED')
  if (!debt.egcs_fc_linkedreceivable && (moneyToCents(total) < BigInt(0) || (options.submission && moneyToCents(total) <= BigInt(0)))) throw new Error('AR_PRINCIPAL_REQUIRED')
  if (options.submission) {
    const { validateAccountReceivableClaimReductionBasis } = await import('./account-receivable-claim-reductions')
    await validateAccountReceivableClaimReductionBasis(trx, id)
  }
  const poolRecovery = await trx.selectFrom('Funding_Case_Account_Receivable_Recovery').select('id').where('egcs_fc_pool', '=', String(debt.egcs_fc_pool))
    .where('egcs_fc_outcome', '=', 'open').where('_deleted', '=', false).executeTakeFirst()
  if (poolRecovery && (debt.egcs_fc_linkedreceivable || options.submission)) throw new Error('AR_RECOVERY_UNRESOLVED')
  const current = !debt.egcs_fc_linkedreceivable
    ? await readAccountReceivableSources(trx, { agreementId: String(debt.egcs_fc_fundingagreement),
        applicantRecipientId: String(debt.egcs_fc_applicantrecipient), agencyFiscalYearId: String(debt.egcs_fc_agencyfiscalyear),
        claimRelated: debt.egcs_fc_claimrelated, advancePaymentRelated: debt.egcs_fc_advancepaymentrelated, currency: debt.egcs_fc_currency })
    : null
  const positiveChange = lines.some(line => moneyToCents(line.egcs_fc_amount) > BigInt(0))
  const capacitySources = current ?? (positiveChange
    ? await readAccountReceivableSources(trx, { agreementId: String(debt.egcs_fc_fundingagreement),
        applicantRecipientId: String(debt.egcs_fc_applicantrecipient), agencyFiscalYearId: String(debt.egcs_fc_agencyfiscalyear),
        claimRelated: debt.egcs_fc_claimrelated, advancePaymentRelated: debt.egcs_fc_advancepaymentrelated, currency: debt.egcs_fc_currency })
    : null)
  if (debt.egcs_fc_advancepaymentrelated && positiveChange && (!debt.egcs_fc_linkedreceivable || moneyToCents(total) > BigInt(0))) {
    const freshCap = fiscalCapacity(capacitySources ?? [], true)!
    if (debt.egcs_fc_fiscaloutstanding === null) throw new Error('AR_SOURCE_CAPACITY')
    const retainedCap = parseDatabaseMoney(debt.egcs_fc_fiscaloutstanding)
    const cap = moneyToCents(freshCap) < moneyToCents(retainedCap) ? freshCap : retainedCap
    const usage = await trx.selectNoFrom(accountReceivableAdvanceUsage(String(debt.egcs_fc_fundingagreement),
      String(debt.egcs_fc_applicantrecipient), String(debt.egcs_fc_agencyfiscalyear), id).as('amount')).executeTakeFirstOrThrow()
    const reservedChange = debt.egcs_fc_linkedreceivable ? (moneyToCents(total) > BigInt(0) ? total : ZERO) : total
    if (moneyToCents(sumMoney([parseDatabaseMoney(usage.amount), reservedChange])) > moneyToCents(cap)) throw new Error('AR_SOURCE_CAPACITY')
  }
  const aggregateCreditLedger = await hasAccountReceivablePoolLedger(trx)
  const parent = debt.egcs_fc_linkedreceivable ? await readAccountReceivableLineBalances(trx, String(debt.egcs_fc_linkedreceivable)) : []
  for (const line of lines) {
    if (!debt.egcs_fc_linkedreceivable && moneyToCents(line.egcs_fc_amount) < BigInt(0)) throw new Error('AR_NEGATIVE_PRINCIPAL')
    const source = current?.find(item => item.id === line.egcs_fc_sourcekey)
    if (current && (!source || source.egcs_fc_sourceamount !== line.egcs_fc_sourceamount)) throw new Error('AR_BASIS_CHANGED')
    const usage = await trx.selectNoFrom(accountReceivableSourceUsage(String(debt.egcs_fc_fundingagreement), line.egcs_fc_sourcekey, id, { applicantRecipientId: String(debt.egcs_fc_applicantrecipient) }).as('amount')).executeTakeFirstOrThrow()
    if (moneyToCents(sumMoney([parseDatabaseMoney(usage.amount), ...[(debt.egcs_fc_linkedreceivable && moneyToCents(sumMoney(lines.filter(row => row.egcs_fc_sourcekey === line.egcs_fc_sourcekey).map(row => row.egcs_fc_amount))) < BigInt(0)) ? ZERO : sumMoney(lines.filter(row => row.egcs_fc_sourcekey === line.egcs_fc_sourcekey).map(row => row.egcs_fc_amount))]])) > moneyToCents(line.egcs_fc_sourceamount)) throw new Error('AR_SOURCE_CAPACITY')
    if (debt.egcs_fc_linkedreceivable && moneyToCents(sumMoney(lines.filter(row => row.egcs_fc_sourcekey === line.egcs_fc_sourcekey).map(row => row.egcs_fc_amount))) > BigInt(0)) {
      const freshSource = capacitySources?.find(item => item.id === line.egcs_fc_sourcekey)
      if (!freshSource || moneyToCents(sumMoney([parseDatabaseMoney(usage.amount), ...[(debt.egcs_fc_linkedreceivable && moneyToCents(sumMoney(lines.filter(row => row.egcs_fc_sourcekey === line.egcs_fc_sourcekey).map(row => row.egcs_fc_amount))) < BigInt(0)) ? ZERO : sumMoney(lines.filter(row => row.egcs_fc_sourcekey === line.egcs_fc_sourcekey).map(row => row.egcs_fc_amount))]])) > moneyToCents(freshSource.egcs_fc_sourceamount)) throw new Error('AR_SOURCE_CAPACITY')
    }
    if (debt.egcs_fc_linkedreceivable) {
      const original = parent.find(item => String(item.id) === String(line.egcs_fc_originalline))
      if (!original || moneyToCents(sumMoney([aggregateCreditLedger ? original.egcs_fc_principal : original.egcs_fc_available, ...lines.filter(row => String(row.egcs_fc_originalline) === String(line.egcs_fc_originalline)).map(row => row.egcs_fc_amount)])) < BigInt(0)) throw new Error('AR_BELOW_RECOVERED')
    }
  }
  if (debt.egcs_fc_linkedreceivable) {
    for (const line of lines) {
      if (!line.egcs_fc_accountreceivablechartofaccount) continue
      const effective = await trx.selectFrom('Funding_Case_Agreement_Account_Receivable_Line as coding')
        .innerJoin('Funding_Case_Agreement_Account_Receivable as root', 'root.id', 'coding.egcs_fc_receivable')
        .select(sql<string>`COALESCE(sum(coding.egcs_fc_amount),0)::text`.as('amount'))
        .where('root.egcs_fc_outcome', '=', 'posted').where('root._deleted', '=', false).where('coding._deleted', '=', false)
        .where('coding.egcs_fc_accountreceivablechartofaccount', '=', line.egcs_fc_accountreceivablechartofaccount)
        .where(eb => eb.or([eb('coding.id', '=', String(line.egcs_fc_originalline)), eb('coding.egcs_fc_originalline', '=', String(line.egcs_fc_originalline))])).executeTakeFirstOrThrow()
      const deltas = lines.filter(row => row.egcs_fc_originalline === line.egcs_fc_originalline && row.egcs_fc_accountreceivablechartofaccount === line.egcs_fc_accountreceivablechartofaccount)
      if (moneyToCents(sumMoney([parseDatabaseMoney(effective.amount), ...deltas.map(row => row.egcs_fc_amount)])) < BigInt(0)) throw new Error('AR_BELOW_RECOVERED')
    }
    const balance = await readAccountReceivableCashBalance(trx, String(debt.egcs_fc_linkedreceivable))
    if (moneyToCents(total) < BigInt(0) && moneyToCents(balance.egcs_fc_outstanding) === BigInt(0)) throw new Error('AR_CLEARED')
    if (moneyToCents(sumMoney([balance.egcs_fc_available, total])) < BigInt(0)) throw new Error('AR_BELOW_RECOVERED')
  }
  const coding = await readAccountReceivableCoding(trx, id)
  const agreement = await trx.selectFrom('Funding_Case_Agreement_Profile').select('egcs_fc_transferpaymentstream')
    .where('id', '=', String(debt.egcs_fc_fundingagreement)).executeTakeFirstOrThrow()
  const pool = await trx.selectFrom('Funding_Case_Account_Receivable_Pool').select('egcs_fc_agency').where('id', '=', String(debt.egcs_fc_pool)).executeTakeFirstOrThrow()
  for (const line of lines) {
    if (options.submission && moneyToCents(line.egcs_fc_amount) !== BigInt(0) && !line.egcs_fc_accountreceivablechartofaccount) throw new Error('AR_ACCOUNT_REQUIRED')
    if (line.egcs_fc_accountreceivablechartofaccount) await readAccountReceivableAccount(trx, { id: String(line.egcs_fc_accountreceivablechartofaccount),
      agencyId: String(pool.egcs_fc_agency), streamId: String(agreement.egcs_fc_transferpaymentstream), agencyFiscalYearId: String(debt.egcs_fc_agencyfiscalyear), currency: debt.egcs_fc_currency })
    const matching = coding.filter(row => String(row.egcs_fc_receivableline) === String(line.id))
    if (sumMoney(matching.map(row => row.egcs_fc_amount)) !== line.egcs_fc_amount) throw new Error('AR_CODING_TOTAL')
    const source = current?.find(item => item.id === line.egcs_fc_sourcekey)
    if (source) {
      const retained = matching.map(row => ({ egcs_fc_commitmentline: String(row.egcs_fc_commitmentline), egcs_fc_chartofaccount: String(row.egcs_fc_chartofaccount),
        egcs_fc_agencychartofaccount: String(row.egcs_fc_agencychartofaccount), egcs_fc_agencyfiscalyear: String(row.egcs_fc_agencyfiscalyear),
        egcs_fc_periodstart: row.egcs_fc_periodstart, egcs_fc_periodend: row.egcs_fc_periodend, egcs_fc_paidbasis: row.egcs_fc_paidbasis, egcs_fc_sharedpaidbasis: row.egcs_fc_sharedpaidbasis,
        egcs_fc_accountingdimensions: row.egcs_fc_accountingdimensions }))
      const canonical = (rows: typeof retained) => JSON.stringify(rows.toSorted((a, b) => `${a.egcs_fc_commitmentline}:${a.egcs_fc_chartofaccount}:${a.egcs_fc_periodstart}:${a.egcs_fc_periodend}`.localeCompare(`${b.egcs_fc_commitmentline}:${b.egcs_fc_chartofaccount}:${b.egcs_fc_periodstart}:${b.egcs_fc_periodend}`)))
      if (canonical(retained) !== canonical(source.coding)) throw new Error('AR_BASIS_CHANGED')
    }
  }
  const paidBasisKey = (partition: typeof coding[number]) => [partition.egcs_fc_fundingagreement, partition.egcs_fc_commitmentline,
    partition.egcs_fc_chartofaccount, partition.egcs_fc_agencyfiscalyear, partition.egcs_fc_periodstart, partition.egcs_fc_periodend].join(':')
  const netCoding = new Map<string, Money>()
  for (const partition of coding) {
    const basisKey = paidBasisKey(partition)
    netCoding.set(basisKey, sumMoney([netCoding.get(basisKey) ?? ZERO, partition.egcs_fc_amount]))
  }
  for (const partition of coding.filter(row => moneyToCents(row.egcs_fc_amount) > BigInt(0) && moneyToCents(netCoding.get(paidBasisKey(row))!) > BigInt(0))) {
    const key = (alias: string) => sql<boolean>`${sql.ref(`${alias}.egcs_fc_fundingagreement`)} = ${partition.egcs_fc_fundingagreement}
      AND ${sql.ref(`${alias}.egcs_fc_commitmentline`)} = ${partition.egcs_fc_commitmentline}
      AND ${sql.ref(`${alias}.egcs_fc_chartofaccount`)} = ${partition.egcs_fc_chartofaccount}
      AND ${sql.ref(`${alias}.egcs_fc_agencyfiscalyear`)} = ${partition.egcs_fc_agencyfiscalyear}
      AND ${sql.ref(`${alias}.egcs_fc_periodstart`)} = ${partition.egcs_fc_periodstart}
      AND ${sql.ref(`${alias}.egcs_fc_periodend`)} = ${partition.egcs_fc_periodend}`
    const proposalUsage = trx.selectFrom('Funding_Case_Agreement_Account_Receivable_Coding as coding')
      .innerJoin('Funding_Case_Agreement_Account_Receivable as root', 'root.id', 'coding.egcs_fc_receivable')
      .select(['root.id', 'root.egcs_fc_outcome', sql<string>`sum(coding.egcs_fc_amount)`.as('amount')])
      .where(key('coding')).where('root.egcs_fc_pool', '=', String(debt.egcs_fc_pool)).where('root.egcs_fc_outcome', 'in', ['open', 'posted'])
      .where('root._deleted', '=', false).where('coding._deleted', '=', false)
      .groupBy(['root.id', 'root.egcs_fc_outcome']).as('usage')
    const reservedCoding = await trx.selectFrom(proposalUsage)
      .select(sql<string>`COALESCE(sum(CASE WHEN usage.egcs_fc_outcome='posted' OR usage.id=${id} THEN usage.amount ELSE greatest(usage.amount,0) END),0)::text`.as('amount'))
      .executeTakeFirstOrThrow()
    const receipts = await trx.selectFrom('Funding_Case_Account_Receivable_Posting as posting')
      .innerJoin('Funding_Case_Account_Receivable_Recovery as recovery', 'recovery.id', 'posting.egcs_fc_recovery')
      .select(sql<string>`COALESCE(sum(posting.egcs_fc_amount),0)::text`.as('amount'))
      .where(key('posting')).where('recovery.egcs_fc_pool', '=', String(debt.egcs_fc_pool)).where('recovery.egcs_fc_outcome', '=', 'posted')
      .where('posting._deleted', '=', false).where('recovery._deleted', '=', false).executeTakeFirstOrThrow()
    const sourceLine = lines.find(line => String(line.id) === String(partition.egcs_fc_receivableline))
    const fresh = freshCoding(capacitySources, sourceLine?.egcs_fc_sourcekey, partition)
    const capacity = fresh && moneyToCents(fresh.egcs_fc_sharedpaidbasis) < moneyToCents(partition.egcs_fc_sharedpaidbasis) ? fresh.egcs_fc_sharedpaidbasis : partition.egcs_fc_sharedpaidbasis
    if (!fresh || moneyToCents(subtractMoney(parseDatabaseMoney(reservedCoding.amount), parseDatabaseMoney(receipts.amount))) > moneyToCents(capacity)) throw new Error('AR_CODING_CAPACITY')
  }
  return { debt, lines, coding }
}

export const createAccountReceivable = async (event: H3Event, agreementId: string, input: AccountReceivableCreate) => {
  const context = await authorizeAccountReceivableAgreement(event, agreementId, 'create')
  const agreement = await event.context.$db.selectFrom('Funding_Case_Agreement_Profile').select('egcs_fc_currency').where('id', '=', agreementId).executeTakeFirstOrThrow()
  if (!input.egcs_fc_linkedreceivable) await requireAccountReceivableSourceRead(event, event.context.$db, agreementId)
  return await executeFreshAccountReceivableWrite(event, { agencyId: context.agencyId, applicantRecipientId: input.egcs_fc_applicantrecipient,
    currency: agreement.egcs_fc_currency, agreementIds: [agreementId] }, async (trx, auth, poolId) => {
    if (input.egcs_fc_linkedreceivable) await authorizeFreshAssignedItem(event, trx, auth, 'fundingcaseaccountreceivable', input.egcs_fc_linkedreceivable, 'update')
    const relationship = await trx.selectFrom('Funding_Case_Agreement_Applicant_Recipient').select(['id', 'egcs_fc_agencyfinancialid'])
      .where('egcs_fc_fundingagreement', '=', agreementId).where('egcs_fc_applicantrecipient', '=', input.egcs_fc_applicantrecipient).where('_deleted', '=', false).executeTakeFirst()
    const year = await trx.selectFrom('Agency_Fiscal_Year').select('id').where('id', '=', input.egcs_fc_agencyfiscalyear)
      .where('egcs_ay_organizationagency', '=', context.agencyId).where('_deleted', '=', false).executeTakeFirst()
    if (!relationship || !year) return await accountReceivableError(event, 'AR_OWNER_MISMATCH')
    const creatorId = await resolveAssignmentCommonUserId(trx, auth.userId)
    if (!creatorId) return await forbidden(event)
    const original = input.egcs_fc_linkedreceivable
      ? await trx.selectFrom('Funding_Case_Agreement_Account_Receivable').selectAll()
          .where('id', '=', input.egcs_fc_linkedreceivable).where('_deleted', '=', false).forUpdate().executeTakeFirst()
      : null
    if (input.egcs_fc_linkedreceivable && (!original || original.egcs_fc_outcome !== 'posted' || original.egcs_fc_linkedreceivable
      || String(original.egcs_fc_fundingagreement) !== agreementId || String(original.egcs_fc_applicantrecipient) !== input.egcs_fc_applicantrecipient
      || String(original.egcs_fc_agencyfiscalyear) !== input.egcs_fc_agencyfiscalyear || String(original.egcs_fc_type) !== input.egcs_fc_type)) return await accountReceivableError(event, 'AR_INVALID_ADJUSTMENT')
    const entityType = original ? 'fundingcaseaccountreceivableadjustment' as const : 'fundingcaseaccountreceivable' as const
    const financialId = original ? input.egcs_fc_agencyfinancialid ?? String(original.egcs_fc_agencyfinancialid) : relationship.egcs_fc_agencyfinancialid ? String(relationship.egcs_fc_agencyfinancialid) : null
    if (!financialId) return await accountReceivableError(event, 'AR_OWNER_MISMATCH')
    const financial = await assertAgreementFinancialId(event, trx, context.streamId, input.egcs_fc_applicantrecipient, financialId, ['egcs_fc_agencyfinancialid'], {})
    let definition: { egcs_fc_typename_en: string; egcs_fc_typename_fr: string; egcs_fc_typedescription_en: string; egcs_fc_typedescription_fr: string; egcs_fc_monitorrequired: boolean; egcs_fc_advancepaymentrelated: boolean; egcs_fc_claimrelated: boolean }
    try {
      if (original) definition = original
      else {
        const type = await readAccountReceivableType(trx, context.agencyId, input.egcs_fc_type)
        definition = { egcs_fc_typename_en: type.egcs_ay_name_en, egcs_fc_typename_fr: type.egcs_ay_name_fr,
          egcs_fc_typedescription_en: type.egcs_ay_description_en, egcs_fc_typedescription_fr: type.egcs_ay_description_fr,
          egcs_fc_monitorrequired: type.egcs_ay_monitorrequired, egcs_fc_advancepaymentrelated: type.egcs_ay_advancepaymentrelated, egcs_fc_claimrelated: type.egcs_ay_claimrelated }
      }
    } catch (error) { return await accountReceivableError(event, error instanceof Error ? error.message : 'AR_TYPE_UNAVAILABLE') }
    if (definition.egcs_fc_monitorrequired !== Boolean(input.egcs_fc_monitorfollowup)) return await accountReceivableError(event, 'AR_MONITOR_REQUIRED')
    if (original && !await hasAccountReceivablePoolLedger(trx) && moneyToCents(sumMoney((await readAccountReceivableLineBalances(trx, String(original.id))).map(line => line.egcs_fc_outstanding))) <= BigInt(0)) return await accountReceivableError(event, 'AR_CLEARED')
    if (original && (input.egcs_fc_monitorfollowup ?? null) !== original.egcs_fc_monitorfollowup) return await accountReceivableError(event, 'AR_MONITOR_OWNER')
    if (!original && input.egcs_fc_monitorfollowup) {
      if (!auth.userAbilities.authorize('agreement', 'read', context.scope)) return await forbidden(event)
      const followup = await trx.selectFrom('Funding_Case_Agreement_Monitor_Followup as followup')
        .innerJoin('Funding_Case_Agreement_Monitor as monitor', 'monitor.id', 'followup.egcs_fc_fundingagreementmonitor')
        .innerJoin('Transfer_Payment_Monitor_Type as monitor_type', 'monitor_type.id', 'monitor.egcs_fc_type')
        .innerJoin('Agency_Monitor_Type as agency_type', 'agency_type.id', 'monitor_type.egcs_tp_agencymonitortype')
        .where('agency_type.egcs_ay_receivableeligible', '=', true).where('agency_type._deleted', '=', false).where('monitor_type._deleted', '=', false)
        .select('followup.id').where('followup.id', '=', input.egcs_fc_monitorfollowup).where('monitor.egcs_fc_fundingagreement', '=', agreementId)
        .where('followup._deleted', '=', false).where('monitor._deleted', '=', false).forUpdate('agency_type').executeTakeFirst()
      if (!followup) return await accountReceivableError(event, 'AR_MONITOR_OWNER')
    }
    const debtorLabels = await trx.selectFrom('Applicant_Recipient_Profile').select(['egcs_ar_legalname_en', 'egcs_ar_legalname_fr', 'egcs_ar_operatingname_en', 'egcs_ar_operatingname_fr'])
      .where('id', '=', input.egcs_fc_applicantrecipient).where('_deleted', '=', false).executeTakeFirstOrThrow()
    const yearLabels = await trx.selectFrom('Agency_Fiscal_Year').select('egcs_ay_fiscalyeardisplay').where('id', '=', input.egcs_fc_agencyfiscalyear).executeTakeFirstOrThrow()
    const sources = await readAccountReceivableSources(trx, { agreementId, applicantRecipientId: input.egcs_fc_applicantrecipient,
      agencyFiscalYearId: input.egcs_fc_agencyfiscalyear, claimRelated: definition.egcs_fc_claimrelated, advancePaymentRelated: definition.egcs_fc_advancepaymentrelated, currency: agreement.egcs_fc_currency })
    const selected = original ? [] : sources.filter(source => input.egcs_fc_sources?.includes(source.id))
    try {
      await assertAccountReceivableSourceOrigin(trx, agreementId, input, definition, sources)
    } catch (error) { return await accountReceivableError(event, error instanceof Error ? error.message : 'AR_SOURCE_UNAVAILABLE') }
    const fiscalSnapshot = fiscalCapacity(sources, definition.egcs_fc_advancepaymentrelated)
    if (!original && (!selected.length || (input.egcs_fc_sources?.length && selected.length !== input.egcs_fc_sources.length))) return await accountReceivableError(event, 'AR_SOURCE_UNAVAILABLE')
    const number = await trx.selectFrom('Funding_Case_Agreement_Account_Receivable').select(eb => eb.fn.max<number>('egcs_fc_number').as('maximum'))
      .where('egcs_fc_fundingagreement', '=', agreementId).executeTakeFirstOrThrow()
    const retainedAgreement = await trx.selectFrom('Funding_Case_Agreement_Profile').select('egcs_fc_agreementnumber').where('id', '=', agreementId).executeTakeFirstOrThrow()
    const created = await trx.insertInto('Funding_Case_Agreement_Account_Receivable').values({
      egcs_fc_entitytype: entityType, egcs_fc_amount: databaseMoneyValue(input.egcs_fc_amount ?? ZERO), egcs_fc_agencyfinancialid: financialId, egcs_fc_financialsystemid: String(financial.egcs_ar_financialsystemid),
      egcs_fc_fundingagreement: agreementId, egcs_fc_pool: poolId, egcs_fc_applicantrecipient: input.egcs_fc_applicantrecipient,
      egcs_fc_agencyfiscalyear: input.egcs_fc_agencyfiscalyear, egcs_fc_type: input.egcs_fc_type,
      egcs_fc_fiscaloutstanding: fiscalSnapshot === null ? null : databaseMoneyValue(fiscalSnapshot),
      egcs_fc_typename_en: definition.egcs_fc_typename_en, egcs_fc_typename_fr: definition.egcs_fc_typename_fr,
      egcs_fc_typedescription_en: definition.egcs_fc_typedescription_en, egcs_fc_typedescription_fr: definition.egcs_fc_typedescription_fr,
      egcs_fc_monitorrequired: definition.egcs_fc_monitorrequired, egcs_fc_advancepaymentrelated: definition.egcs_fc_advancepaymentrelated, egcs_fc_claimrelated: definition.egcs_fc_claimrelated, egcs_fc_currency: agreement.egcs_fc_currency,
      egcs_fc_number: (number.maximum ?? 0) + 1, egcs_fc_agreementnumber: retainedAgreement.egcs_fc_agreementnumber,
      egcs_fc_requesteddate: input.egcs_fc_requesteddate, egcs_fc_recoverymethod: input.egcs_fc_recoverymethod,
      egcs_fc_recipientpreference: input.egcs_fc_recipientpreference ?? null,
      egcs_fc_preferenceoverride_en: input.egcs_fc_preferenceoverride_en, egcs_fc_preferenceoverride_fr: input.egcs_fc_preferenceoverride_fr,
      egcs_fc_narrative_en: input.egcs_fc_narrative_en, egcs_fc_narrative_fr: input.egcs_fc_narrative_fr,
      egcs_fc_linkedreceivable: input.egcs_fc_linkedreceivable ?? null, egcs_fc_monitorfollowup: input.egcs_fc_monitorfollowup ?? null,
      egcs_fc_createdby: creatorId, egcs_fc_status: await lockAgencyDraftStatus(trx, context.agencyId)
    }).returningAll().returning([sql<string | null>`egcs_fc_fiscaloutstanding::text`.as('egcs_fc_fiscaloutstanding'), databaseMoneyText(sql.ref('egcs_fc_amount')).as('egcs_fc_amount')]).executeTakeFirstOrThrow()
    await createPrimaryEntityAssignment(trx, entityType, String(created.id), creatorId)
    if (original) {
      const originalLines = await readAccountReceivableLines(trx, String(original.id))
      const originalCoding = await readAccountReceivableCoding(trx, String(original.id))
      for (const line of originalLines) {
        const { id: lineId, ...retained } = line
        const copy = await trx.insertInto('Funding_Case_Agreement_Account_Receivable_Line').values({ ...retained,
          egcs_fc_receivable: String(created.id), egcs_fc_originalline: String(lineId), egcs_fc_sourceamount: databaseMoneyValue(line.egcs_fc_sourceamount), egcs_fc_amount: databaseMoneyValue(ZERO),
          egcs_fc_evidence: sql`${JSON.stringify(line.egcs_fc_evidence)}::jsonb`,
          egcs_fc_accountreceivableaccountingdimensions: sql`${JSON.stringify(line.egcs_fc_accountreceivableaccountingdimensions)}::jsonb` }).returning('id').executeTakeFirstOrThrow()
        for (const coding of originalCoding.filter(row => String(row.egcs_fc_receivableline) === String(lineId))) {
          const { id: _codingId, ...retainedCoding } = coding
          await trx.insertInto('Funding_Case_Agreement_Account_Receivable_Coding').values({ ...retainedCoding,
            egcs_fc_receivable: String(created.id), egcs_fc_receivableline: String(copy.id), egcs_fc_paidbasis: databaseMoneyValue(coding.egcs_fc_paidbasis), egcs_fc_sharedpaidbasis: databaseMoneyValue(freshCoding(sources, line.egcs_fc_sourcekey, coding)?.egcs_fc_sharedpaidbasis ?? ZERO), egcs_fc_amount: databaseMoneyValue(ZERO),
            egcs_fc_accountingdimensions: sql`${JSON.stringify(coding.egcs_fc_accountingdimensions)}::jsonb` }).execute()
        }
      }
    } else for (const source of selected) {
      const { id: sourceKey, label_en: _labelEn, label_fr: _labelFr, coding, ...retained } = source
      const line = await trx.insertInto('Funding_Case_Agreement_Account_Receivable_Line').values({ ...retained,
        egcs_fc_receivable: String(created.id), egcs_fc_fundingagreement: agreementId, egcs_fc_sourcekey: sourceKey,
        egcs_fc_sourceamount: databaseMoneyValue(source.egcs_fc_sourceamount), egcs_fc_amount: databaseMoneyValue(ZERO), egcs_fc_evidence: sql`${JSON.stringify(json({ source: source.egcs_fc_evidence,
          egcs_fc_debtorname_en: debtorLabels.egcs_ar_legalname_en ?? debtorLabels.egcs_ar_operatingname_en ?? '',
          egcs_fc_debtorname_fr: debtorLabels.egcs_ar_legalname_fr ?? debtorLabels.egcs_ar_operatingname_fr ?? '',
          egcs_fc_fiscalyeardisplay: yearLabels.egcs_ay_fiscalyeardisplay }))}::jsonb` }).returning('id').executeTakeFirstOrThrow()
      for (const row of coding) await trx.insertInto('Funding_Case_Agreement_Account_Receivable_Coding').values({ ...row,
        egcs_fc_receivable: String(created.id), egcs_fc_receivableline: String(line.id), egcs_fc_fundingagreement: agreementId,
        egcs_fc_paidbasis: databaseMoneyValue(row.egcs_fc_paidbasis), egcs_fc_sharedpaidbasis: databaseMoneyValue(row.egcs_fc_sharedpaidbasis), egcs_fc_amount: databaseMoneyValue(ZERO),
        egcs_fc_accountingdimensions: sql`${JSON.stringify(row.egcs_fc_accountingdimensions)}::jsonb` }).execute()
    }
    if (!original) {
      const { allocateAgreementCoding } = await import('./agreement-coding-allocator')
      const allocations = await allocateAgreementCoding(event, trx, { agreementId, agencyId: context.agencyId, streamId: context.streamId,
        amount: input.egcs_fc_amount!, currency: agreement.egcs_fc_currency, output: { kind: 'receivable' }, agencyFiscalYearId: input.egcs_fc_agencyfiscalyear })
      if (allocations) {
        const { applyAllocatedAccountReceivableCoding } = await import('./account-receivable-allocation')
        try {
          await applyAllocatedAccountReceivableCoding(trx, String(created.id), allocations)
        } catch (error) {
          return await accountReceivableError(event, error instanceof Error ? error.message : 'AR_CODING_CAPACITY')
        }
      }
    }
    return { ...created, egcs_fc_amount: parseDatabaseMoney(created.egcs_fc_amount), egcs_fc_fiscaloutstanding: created.egcs_fc_fiscaloutstanding === null ? null : parseDatabaseMoney(created.egcs_fc_fiscaloutstanding) }
  }, { action: 'create', sourceRead: !input.egcs_fc_linkedreceivable })
}

export const editAccountReceivable = async (event: H3Event, id: string, input: AccountReceivableEdit | AccountReceivableSummaryEdit) => {
  const context = await authorizeAccountReceivable(event, id, 'update')
  return await executeFreshAccountReceivableWrite(event, { ...context, agreementIds: [context.agreementId] }, async trx => {
    const debt = await assertAccountReceivableEditable(event, trx, id)
    const lines = await readAccountReceivableLines(trx, id)
    const submittedLines = 'egcs_fc_lines' in input ? input.egcs_fc_lines : lines.map(line => ({ id: String(line.id), egcs_fc_amount: line.egcs_fc_amount, egcs_fc_accountreceivablechartofaccount: line.egcs_fc_accountreceivablechartofaccount ? String(line.egcs_fc_accountreceivablechartofaccount) : null }))
    if (lines.length !== submittedLines.length || submittedLines.some(line => !lines.some(saved => String(saved.id) === line.id))) return await accountReceivableError(event, 'AR_LINE_SET_STALE')
    const { egcs_fc_lines, egcs_fc_agencyfinancialid, ...header } = { ...input, egcs_fc_lines: submittedLines }
    if (egcs_fc_agencyfinancialid && egcs_fc_agencyfinancialid !== String(debt.egcs_fc_agencyfinancialid)) {
      if (!debt.egcs_fc_linkedreceivable) return await accountReceivableError(event, 'AR_IMMUTABLE')
      const financial = await assertAgreementFinancialId(event, trx, context.streamId, String(debt.egcs_fc_applicantrecipient), egcs_fc_agencyfinancialid)
      await trx.updateTable('Funding_Case_Agreement_Account_Receivable').set({ egcs_fc_agencyfinancialid, egcs_fc_financialsystemid: String(financial.egcs_ar_financialsystemid) }).where('id', '=', id).execute()
    }
    const refreshedSources = debt.egcs_fc_linkedreceivable
      ? await readAccountReceivableSources(trx, { agreementId: String(debt.egcs_fc_fundingagreement), applicantRecipientId: String(debt.egcs_fc_applicantrecipient),
          agencyFiscalYearId: String(debt.egcs_fc_agencyfiscalyear), currency: debt.egcs_fc_currency, claimRelated: debt.egcs_fc_claimrelated, advancePaymentRelated: debt.egcs_fc_advancepaymentrelated })
      : null
    const fiscalSnapshot = refreshedSources ? fiscalCapacity(refreshedSources, debt.egcs_fc_advancepaymentrelated) : null
    await trx.updateTable('Funding_Case_Agreement_Account_Receivable').set({ ...header, egcs_fc_recipientpreference: header.egcs_fc_recipientpreference ?? null,
      ...(refreshedSources ? { egcs_fc_fiscaloutstanding: fiscalSnapshot === null ? null : databaseMoneyValue(fiscalSnapshot) } : {}) }).where('id', '=', id).execute()
    const coding = await readAccountReceivableCoding(trx, id)
    for (const line of egcs_fc_lines) {
      const saved = lines.find(row => String(row.id) === line.id)!
      if (moneyToCents(line.egcs_fc_amount) !== BigInt(0) && !line.egcs_fc_accountreceivablechartofaccount) return await accountReceivableError(event, 'AR_ACCOUNT_REQUIRED')

      const partitions = coding.filter(row => String(row.egcs_fc_receivableline) === line.id)
      let allocated: ReturnType<typeof allocateRetainedAccountReceivableCoding>
      try {
        allocated = allocateRetainedAccountReceivableCoding(line.egcs_fc_amount, partitions.map(row => ({ id: String(row.id), basis: row.egcs_fc_paidbasis, capacity: row.egcs_fc_paidbasis })))
      } catch (error) {
        return await accountReceivableError(event, error instanceof Error ? error.message : 'AR_CODING_CAPACITY')
      }
      let account
      try {
        account = line.egcs_fc_accountreceivablechartofaccount
          ? await readAccountReceivableAccount(trx, {
              id: line.egcs_fc_accountreceivablechartofaccount, agencyId: context.agencyId, streamId: context.streamId, agencyFiscalYearId: String(debt.egcs_fc_agencyfiscalyear), currency: debt.egcs_fc_currency })
          : null
      } catch (error) { return await accountReceivableError(event, error instanceof Error ? error.message : 'AR_ACCOUNT_UNAVAILABLE') }
      await trx.updateTable('Funding_Case_Agreement_Account_Receivable_Line').set({ egcs_fc_amount: databaseMoneyValue(line.egcs_fc_amount),
        egcs_fc_accountreceivablechartofaccount: account ? String(account.id) : null,
        egcs_fc_accountreceivableaccountingdimensions: sql`${JSON.stringify(account && String(account.id) === saved.egcs_fc_accountreceivablechartofaccount ? saved.egcs_fc_accountreceivableaccountingdimensions : account?.egcs_ay_accountingdimensions ?? [])}::jsonb` }).where('id', '=', line.id).execute()
      for (const split of allocated) await trx.updateTable('Funding_Case_Agreement_Account_Receivable_Coding').set({ egcs_fc_amount: databaseMoneyValue(split.amount),
        ...(refreshedSources ? { egcs_fc_sharedpaidbasis: databaseMoneyValue(freshCoding(refreshedSources, saved.egcs_fc_sourcekey, partitions.find(row => String(row.id) === split.id)!)?.egcs_fc_sharedpaidbasis ?? ZERO) } : {}) }).where('id', '=', split.id).execute()
    }
    try {
      await validateAccountReceivableBasis(trx, id)
    } catch (error) {
      return await accountReceivableError(event, error instanceof Error ? error.message : 'AR_INVALID_BASIS')
    }
    const updated = await trx.selectFrom('Funding_Case_Agreement_Account_Receivable').selectAll()
      .select([sql<string | null>`egcs_fc_fiscaloutstanding::text`.as('egcs_fc_fiscaloutstanding'), databaseMoneyText(sql.ref('egcs_fc_amount')).as('egcs_fc_amount')]).where('id', '=', id).executeTakeFirstOrThrow()
    return { ...updated, egcs_fc_amount: parseDatabaseMoney(updated.egcs_fc_amount), egcs_fc_fiscaloutstanding: updated.egcs_fc_fiscaloutstanding === null ? null : parseDatabaseMoney(updated.egcs_fc_fiscaloutstanding) }
  }, { target: { entityType: context.entityType, entityId: id } })
}

export const deleteAccountReceivable = async (event: H3Event, id: string) => {
  const context = await authorizeAccountReceivable(event, id, 'delete')
  return await executeFreshAccountReceivableWrite(event, { ...context, agreementIds: [context.agreementId] }, async trx => {
    const row = await assertAccountReceivableEditable(event, trx, id)
    if (!row.egcs_cn_isdraft) return await accountReceivableError(event, 'AR_DELETE_DRAFT_ONLY')
    const workflow = await trx.selectFrom('Common_Runtime').select('id').where('egcs_cn_entitytype', '=', context.entityType).where('egcs_cn_entityid', '=', id).executeTakeFirst()
    const attachments = await trx.selectFrom('Common_Entity_Attachment').select('id').where('egcs_cn_entitytype', '=', context.entityType).where('egcs_cn_entityid', '=', id).where('_deleted', '=', false).executeTakeFirst()
    if (workflow || attachments) return await accountReceivableError(event, 'AR_RETAINED_EVIDENCE')
    await trx.updateTable('Funding_Case_Agreement_Account_Receivable').set({ _deleted: true }).where('id', '=', id).execute()
    await trx.updateTable('Common_Entity_Assignment').set({ _deleted: true }).where('egcs_cn_entitytype', '=', context.entityType).where('egcs_cn_entityid', '=', id).execute()
    return { success: true }
  }, { action: 'delete', target: { entityType: context.entityType, entityId: id } })
}

const omitIndividualRecoveryBalances = <T extends object>(line: T) => {
  const { egcs_fc_recovered: _recovered, egcs_fc_reserved: _reserved, egcs_fc_outstanding: _outstanding, egcs_fc_available: _available, ...source } = line as T & {
    egcs_fc_recovered?: unknown; egcs_fc_reserved?: unknown; egcs_fc_outstanding?: unknown; egcs_fc_available?: unknown
  }
  return source
}

export const getAccountReceivableDetail = async (event: H3Event, id: string) => {
  const context = await authorizeAccountReceivable(event, id)
  const auth = await requireAuthContext(event)
  const db = event.context.$db
  const debt = await db.selectFrom('Funding_Case_Agreement_Account_Receivable').selectAll()
    .select([sql<string | null>`egcs_fc_fiscaloutstanding::text`.as('egcs_fc_fiscaloutstanding'), databaseMoneyText(sql.ref('egcs_fc_amount')).as('egcs_fc_amount')]).where('id', '=', id).where('_deleted', '=', false).executeTakeFirstOrThrow()
  const [lines, coding, status, completion, assignment] = await Promise.all([readAccountReceivableLineBalances(db, debt.egcs_fc_linkedreceivable ? String(debt.egcs_fc_linkedreceivable) : id),
    readAccountReceivableCoding(db, id), db.selectFrom('Common_Status').select(['egcs_cn_terminal', 'egcs_cn_readonly', 'egcs_cn_isdraft']).where('id', '=', debt.egcs_fc_status).executeTakeFirstOrThrow(),
    resolveCompletionEvidenceId(db, context.entityType, id), resolveAssignedItemTargetGrant(auth.userId, { entityType: context.entityType, entityId: id }, db)])
  const savedLines = debt.egcs_fc_linkedreceivable ? await readAccountReceivableLines(db, id) : lines
  const principal = sumMoney(lines.map(line => line.egcs_fc_principal))
  const cashBalance = await readAccountReceivableCashBalance(db, debt.egcs_fc_linkedreceivable ? String(debt.egcs_fc_linkedreceivable) : id)
  const recovered = cashBalance.egcs_fc_recovered
  const outstanding = subtractMoney(principal, recovered)
  const editable = debt.egcs_fc_outcome === 'open' && !status.egcs_cn_terminal && !status.egcs_cn_readonly && !completion
  const assigned = Boolean(assignment)
  const work = assigned && auth.userAbilities.authorize('account_receivable', 'update', context.scope)
  const [record] = await withBusinessRecordState(db, context.entityType, [debt])
  const poolLedger = await hasAccountReceivablePoolLedger(db)
  let labels = (savedLines[0]?.egcs_fc_evidence ?? {}) as Record<string, JsonValue>
  if (!savedLines.length) {
    const [debtor, year] = await Promise.all([
      db.selectFrom('Applicant_Recipient_Profile').select(['egcs_ar_legalname_en', 'egcs_ar_legalname_fr', 'egcs_ar_operatingname_en', 'egcs_ar_operatingname_fr'])
        .where('id', '=', String(debt.egcs_fc_applicantrecipient)).executeTakeFirstOrThrow(),
      db.selectFrom('Agency_Fiscal_Year').select('egcs_ay_fiscalyeardisplay')
        .where('id', '=', String(debt.egcs_fc_agencyfiscalyear)).executeTakeFirstOrThrow()
    ])
    labels = { egcs_fc_debtorname_en: debtor.egcs_ar_legalname_en ?? debtor.egcs_ar_operatingname_en ?? '',
      egcs_fc_debtorname_fr: debtor.egcs_ar_legalname_fr ?? debtor.egcs_ar_operatingname_fr ?? '', egcs_fc_fiscalyeardisplay: year.egcs_ay_fiscalyeardisplay }
  }
  const { readAccountReceivableClaimReductions } = await import('./account-receivable-claim-reductions')
  const creditMemos = await db.selectFrom('Funding_Case_Account_Receivable_Credit_Memo as memo')
    .select(['memo.id', 'memo.egcs_fc_outcome', databaseMoneyText(sql.ref('memo.egcs_fc_totalamount')).as('egcs_fc_amount')])
    .where('memo._deleted', '=', false)
    .where(eb => eb.or([eb('memo.egcs_fc_receivable', '=', id),
      sql<boolean>`memo.egcs_fc_receivables @> ${JSON.stringify([id])}::jsonb`,
      eb.exists(eb.selectFrom('Funding_Case_Account_Receivable_Credit_Memo_Line as line').select('line.id')
        .whereRef('line.egcs_fc_creditmemo', '=', 'memo.id').where('line.egcs_fc_receivable', '=', id).where('line._deleted', '=', false))]))
    .orderBy('memo.id', 'desc').execute()
  const visibleMemos = auth.userAbilities.authorize('account_receivable', 'read', { type: 'agency', agencyId: context.agencyId })
    ? creditMemos.map(memo => ({ id: String(memo.id), egcs_fc_amount: parseDatabaseMoney(memo.egcs_fc_amount), egcs_fc_outcome: memo.egcs_fc_outcome, egcs_fc_reference: String(memo.id), egcs_fc_kind: 'cash' as const, egcs_fc_origin: null }))
    : []
  const relatedOffsets = poolLedger && !debt.egcs_fc_linkedreceivable
    ? await db.selectFrom('Funding_Case_Account_Receivable_Offset_Memo').select(['id', databaseMoneyText(sql.ref('egcs_fc_amount')).as('amount')])
        .where('egcs_fc_receivable', '=', id).where('_deleted', '=', false).orderBy('id', 'desc').execute()
    : []
  const visibleOffsets = await Promise.all(relatedOffsets.map(async memo => {
    // Keep the immutable first origin. A later readable Payment must not replace an unreadable first one.
    const origin = await db.selectFrom('Funding_Case_Account_Receivable_Offset_Memo_Application as application')
      .innerJoin('Funding_Case_Account_Receivable_Recovery as recovery', 'recovery.id', 'application.egcs_fc_recovery')
      .innerJoin('Funding_Case_Agreement_Payment as payment', 'payment.id', 'recovery.egcs_fc_payment')
      .select(['payment.id', 'payment.egcs_fc_fundingagreement', 'recovery.egcs_fc_outcome'])
      .where('application.egcs_fc_offsetmemo', '=', String(memo.id)).where('application._deleted', '=', false)
      .where('application.id', '=', sql<string>`(SELECT min(first_application.id) FROM "Funding_Case_Account_Receivable_Offset_Memo_Application" first_application WHERE first_application.egcs_fc_offsetmemo=${String(memo.id)}::bigint)`)
      .where('recovery._deleted', '=', false).where('payment._deleted', '=', false).orderBy('application.id').executeTakeFirst()
    const paymentOwner = origin ? await resolveAgreementScopeContext(String(origin.egcs_fc_fundingagreement), db) : null
    const readable = Boolean(paymentOwner && auth.userAbilities.authorize('agreement', 'read', paymentOwner.scope))
    return { id: String(memo.id), egcs_fc_kind: 'automatic' as const, egcs_fc_amount: parseDatabaseMoney(memo.amount),
      egcs_fc_reference: `OCM-${memo.id}`, egcs_fc_outcome: origin?.egcs_fc_outcome ?? 'released',
      egcs_fc_origin: origin && readable ? { agreementId: String(origin.egcs_fc_fundingagreement), paymentId: String(origin.id) } : null }
  }))
  const effectiveRecoveryMethod = await readAccountReceivableApprovedRecoveryMethod(db, id)
  const adjustments = await db.selectFrom('Funding_Case_Agreement_Account_Receivable').selectAll()
    .select([sql<string | null>`egcs_fc_fiscaloutstanding::text`.as('egcs_fc_fiscaloutstanding'), databaseMoneyText(sql.ref('egcs_fc_amount')).as('egcs_fc_amount')]).where('egcs_fc_linkedreceivable', '=', id).where('_deleted', '=', false).orderBy('egcs_fc_number').execute()
  const latestPostedAdjustment = !debt.egcs_fc_linkedreceivable && adjustments.some(adjustment => adjustment.egcs_fc_outcome === 'posted')
    ? await db.selectFrom('Funding_Case_Agreement_Account_Receivable').select(['egcs_fc_agencyfinancialid', 'egcs_fc_financialsystemid'])
        .where('egcs_fc_linkedreceivable', '=', id).where('egcs_fc_outcome', '=', 'posted').where('_deleted', '=', false)
        .orderBy('egcs_fc_postedat', 'desc').orderBy('id', 'desc').executeTakeFirst()
    : null
  const effectiveIdentity = latestPostedAdjustment ?? debt
  const projectedAdjustments = await Promise.all(adjustments.map(async adjustment => ({ ...adjustment, egcs_fc_amount: parseDatabaseMoney(adjustment.egcs_fc_amount),
    egcs_fc_fiscaloutstanding: adjustment.egcs_fc_fiscaloutstanding === null ? null : parseDatabaseMoney(adjustment.egcs_fc_fiscaloutstanding),
    egcs_fc_effectiverecoverymethod: effectiveRecoveryMethod,
    egcs_fc_approvedamount: adjustment.egcs_fc_outcome === 'posted' ? sumMoney((await readAccountReceivableLines(db, String(adjustment.id))).map(line => line.egcs_fc_amount)) : ZERO,
    egcs_fc_principal: adjustment.egcs_fc_outcome === 'posted' ? sumMoney((await readAccountReceivableLines(db, String(adjustment.id))).map(line => line.egcs_fc_amount)) : ZERO,
    ...(poolLedger ? {} : { egcs_fc_recovered: ZERO, egcs_fc_reserved: ZERO, egcs_fc_outstanding: ZERO, egcs_fc_available: ZERO, egcs_fc_collectionstate: 'cleared' as const }),
    egcs_fc_debtorname_en: String(labels.egcs_fc_debtorname_en ?? ''), egcs_fc_debtorname_fr: String(labels.egcs_fc_debtorname_fr ?? ''), egcs_fc_fiscalyeardisplay: String(labels.egcs_fc_fiscalyeardisplay ?? '') })))
  return { ...record, egcs_fc_effectiveagencyfinancialid: effectiveIdentity.egcs_fc_agencyfinancialid, egcs_fc_effectivefinancialsystemid: effectiveIdentity.egcs_fc_financialsystemid,
    egcs_fc_parentreadable: Boolean(debt.egcs_fc_linkedreceivable && auth.userAbilities.authorize('account_receivable', 'read', context.scope)), egcs_fc_creditmemos: [...visibleMemos, ...visibleOffsets], egcs_fc_claimreductions: await readAccountReceivableClaimReductions(db, id), egcs_fc_amount: parseDatabaseMoney(debt.egcs_fc_amount), egcs_fc_lines: savedLines.map(line => ({ ...(poolLedger ? omitIndividualRecoveryBalances(line) : line), egcs_fc_coding: coding.filter(row => String(row.egcs_fc_receivableline) === String(line.id)) })), egcs_fc_coding: coding,
    egcs_fc_fiscaloutstanding: debt.egcs_fc_fiscaloutstanding === null ? null : parseDatabaseMoney(debt.egcs_fc_fiscaloutstanding),
    egcs_fc_effectiverecoverymethod: effectiveRecoveryMethod,
    egcs_fc_approvedamount: principal, egcs_fc_proponentreadable: await canAccessApplicantRecipient(auth, String(debt.egcs_fc_applicantrecipient), 'read', db),
    egcs_fc_adjustments: await withBusinessRecordState(db, 'fundingcaseaccountreceivableadjustment', projectedAdjustments),
    ...cashBalance,
    egcs_fc_debtorname_en: String(labels.egcs_fc_debtorname_en ?? ''), egcs_fc_debtorname_fr: String(labels.egcs_fc_debtorname_fr ?? ''), egcs_fc_fiscalyeardisplay: String(labels.egcs_fc_fiscalyeardisplay ?? ''),
    egcs_fc_collectionstate: moneyToCents(outstanding) === BigInt(0) ? 'cleared' as const : moneyToCents(recovered) > BigInt(0) ? 'partially_recovered' as const : 'outstanding' as const,
    egcs_fc_candeletelines: editable && assigned && auth.userAbilities.authorize('account_receivable', 'delete', context.scope),
    egcs_fc_caneditrole: auth.userAbilities.authorize('account_receivable', 'update', context.scope),
    egcs_fc_canedit: editable && work, egcs_fc_canwork: work && debt.egcs_fc_outcome === 'open',
    egcs_fc_candelete: editable && status.egcs_cn_isdraft && assigned && auth.userAbilities.authorize('account_receivable', 'delete', context.scope),
    egcs_fc_cancancel: work && debt.egcs_fc_outcome === 'open', egcs_fc_canlink: debt.egcs_fc_outcome === 'posted' && !debt.egcs_fc_linkedreceivable && auth.userAbilities.authorize('account_receivable', 'create', context.scope),
    egcs_fc_canadjust: debt.egcs_fc_outcome === 'posted' && !debt.egcs_fc_linkedreceivable && auth.userAbilities.authorize('account_receivable', 'create', context.scope),
    egcs_fc_cancreditmemo: debt.egcs_fc_outcome === 'posted' && !debt.egcs_fc_linkedreceivable && auth.userAbilities.authorize('account_receivable', 'create', { type: 'agency', agencyId: context.agencyId }),
    egcs_fc_agreementreadable: auth.userAbilities.authorize('agreement', 'read', context.scope),
    egcs_fc_sourcereadable: auth.userAbilities.authorize('agreement', 'read', context.scope) }
}

export const listAccountReceivables = async (event: H3Event, agreementId: string, input: { page: number; limit: number; search?: string }) => {
  const context = await authorizeAccountReceivableAgreement(event, agreementId)
  const auth = await requireAuthContext(event)
  let query = event.context.$db.selectFrom('Funding_Case_Agreement_Account_Receivable').where('egcs_fc_fundingagreement', '=', agreementId).where('egcs_fc_linkedreceivable', 'is', null).where('_deleted', '=', false)
  if (input.search) query = query.where(eb => eb.or([eb('egcs_fc_narrative_en', 'ilike', `%${input.search}%`), eb('egcs_fc_narrative_fr', 'ilike', `%${input.search}%`)]))
  const ids = await query.select('id').orderBy('egcs_fc_number', 'desc').limit(input.limit).offset((input.page - 1) * input.limit).execute()
  const count = await query.select(sql<string>`count(*)::text`.as('total')).executeTakeFirstOrThrow()
  const agreement = await event.context.$db.selectFrom('Funding_Case_Agreement_Profile').select('egcs_fc_agreementnumber').where('id', '=', agreementId).executeTakeFirstOrThrow()
  const poolLedger = await hasAccountReceivablePoolLedger(event.context.$db)
  const items = await Promise.all(ids.map(async row => {
    const detail = await getAccountReceivableDetail(event, String(row.id))
    if (!detail.egcs_fc_linkedreceivable) return detail
    return { ...detail, egcs_fc_principal: detail.egcs_fc_outcome === 'posted' ? sumMoney(detail.egcs_fc_lines.map(line => line.egcs_fc_amount)) : ZERO,
      ...(poolLedger ? {} : { egcs_fc_recovered: ZERO, egcs_fc_reserved: ZERO, egcs_fc_outstanding: ZERO, egcs_fc_available: ZERO, egcs_fc_collectionstate: 'cleared' as const }) }
  }))
  return { items, total: Number(count.total), page: input.page, limit: input.limit, ...agreement,
    egcs_fc_cancreate: auth.userAbilities.authorize('account_receivable', 'create', context.scope) }
}
