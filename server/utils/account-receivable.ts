/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns -- AR aggregate domain, retained reads and exact assigned writes. */
import type { H3Event } from 'h3'
import { sql, type Kysely, type Transaction } from 'kysely'
import type { Database, JsonValue } from '~~/shared/types/database'
import type { AccountReceivableCreate, AccountReceivableEdit } from '~~/shared/types/schemas/account-receivable'
import { moneyToCents, parseMoney, subtractMoney, sumMoney, type Money } from '~~/shared/utils/money'
import { allocateAccountReceivableCoding, formatAccountReceivableCreditMemoSettlementReference } from '~~/shared/utils/account-receivable'
import { authorize, requireAuthContext } from './authorize'
import { resolveAgreementScopeContext } from './agreement'
import { forbidden, notFound } from './api-errors'
import { createPrimaryEntityAssignment, resolveAssignmentCommonUserId } from './entity-assignment'
import { lockAgencyDraftStatus } from './business-status-runtime'
import { resolveCompletionEvidenceId } from './completion-runtime-core'
import { databaseMoneyText, databaseMoneyValue, parseDatabaseMoney } from './database-money'
import { withBusinessRecordState } from './business-record-state'
import { resolveAssignedItemTargetGrant } from './rbac'
import { accountReceivableSourceUsage, executeFreshAccountReceivableWrite, resolveAccountReceivableRuntimeContext } from './account-receivable-context'
import { accountReceivableError, readAccountReceivableSources, requireAccountReceivableSourceRead } from './account-receivable-source'

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
    .select([databaseMoneyText(sql.ref('egcs_fc_amount')).as('egcs_fc_amount'), databaseMoneyText(sql.ref('egcs_fc_paidbasis')).as('egcs_fc_paidbasis')])
    .where('egcs_fc_receivable', '=', id).where('_deleted', '=', false).orderBy('id').execute()
  return rows.map(row => ({ ...row, egcs_fc_amount: parseDatabaseMoney(row.egcs_fc_amount), egcs_fc_paidbasis: parseDatabaseMoney(row.egcs_fc_paidbasis) }))
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
    || await resolveCompletionEvidenceId(trx, 'fundingcaseaccountreceivable', id)) return await accountReceivableError(event, 'AR_IMMUTABLE')
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

export const validateAccountReceivableBasis = async (trx: Transaction<Database>, id: string, options: { submission?: boolean } = {}) => {
  const debt = await trx.selectFrom('Funding_Case_Agreement_Account_Receivable').selectAll().where('id', '=', id).where('_deleted', '=', false).executeTakeFirstOrThrow()
  const lines = await readAccountReceivableLines(trx, id)
  const total = sumMoney(lines.map(line => line.egcs_fc_amount))
  if (!lines.length) throw new Error('AR_LINES_REQUIRED')
  if (options.submission && !debt.egcs_fc_narrative_en.trim() && !debt.egcs_fc_narrative_fr.trim()) throw new Error('AR_RATIONALE_REQUIRED')
  if (options.submission && debt.egcs_fc_recipientpreference && debt.egcs_fc_recipientpreference !== debt.egcs_fc_recoverymethod
    && !debt.egcs_fc_preferenceoverride_en.trim() && !debt.egcs_fc_preferenceoverride_fr.trim()) throw new Error('AR_OVERRIDE_REQUIRED')
  if (!debt.egcs_fc_linkedreceivable && (moneyToCents(total) < BigInt(0) || (options.submission && moneyToCents(total) <= BigInt(0)))) throw new Error('AR_PRINCIPAL_REQUIRED')
  const poolRecovery = await trx.selectFrom('Funding_Case_Account_Receivable_Recovery').select('id').where('egcs_fc_pool', '=', String(debt.egcs_fc_pool))
    .where('egcs_fc_outcome', '=', 'open').where('_deleted', '=', false).executeTakeFirst()
  if (poolRecovery && (debt.egcs_fc_linkedreceivable || options.submission)) throw new Error('AR_RECOVERY_UNRESOLVED')
  const current = !debt.egcs_fc_linkedreceivable
    ? await readAccountReceivableSources(trx, { agreementId: String(debt.egcs_fc_fundingagreement),
        applicantRecipientId: String(debt.egcs_fc_applicantrecipient), agencyFiscalYearId: String(debt.egcs_fc_agencyfiscalyear),
        type: debt.egcs_fc_type, currency: debt.egcs_fc_currency })
    : null
  const parent = debt.egcs_fc_linkedreceivable ? await readAccountReceivableLineBalances(trx, String(debt.egcs_fc_linkedreceivable)) : []
  for (const line of lines) {
    if (!debt.egcs_fc_linkedreceivable && moneyToCents(line.egcs_fc_amount) < BigInt(0)) throw new Error('AR_NEGATIVE_PRINCIPAL')
    const source = current?.find(item => item.id === line.egcs_fc_sourcekey)
    if (current && (!source || source.egcs_fc_sourceamount !== line.egcs_fc_sourceamount)) throw new Error('AR_BASIS_CHANGED')
    const usage = await trx.selectNoFrom(accountReceivableSourceUsage(String(debt.egcs_fc_fundingagreement), line.egcs_fc_sourcekey, id, { applicantRecipientId: String(debt.egcs_fc_applicantrecipient) }).as('amount')).executeTakeFirstOrThrow()
    if (moneyToCents(sumMoney([parseDatabaseMoney(usage.amount), line.egcs_fc_amount])) > moneyToCents(line.egcs_fc_sourceamount)) throw new Error('AR_SOURCE_CAPACITY')
    if (debt.egcs_fc_linkedreceivable) {
      const original = parent.find(item => String(item.id) === String(line.egcs_fc_originalline))
      if (!original || moneyToCents(sumMoney([original.egcs_fc_available, line.egcs_fc_amount])) < BigInt(0)) throw new Error('AR_BELOW_RECOVERED')
    }
  }
  const coding = await readAccountReceivableCoding(trx, id)
  for (const line of lines) {
    const matching = coding.filter(row => String(row.egcs_fc_receivableline) === String(line.id))
    if (sumMoney(matching.map(row => row.egcs_fc_amount)) !== line.egcs_fc_amount) throw new Error('AR_CODING_TOTAL')
    const source = current?.find(item => item.id === line.egcs_fc_sourcekey)
    if (source) {
      const retained = matching.map(row => ({ egcs_fc_commitmentline: String(row.egcs_fc_commitmentline), egcs_fc_chartofaccount: String(row.egcs_fc_chartofaccount),
        egcs_fc_agencychartofaccount: String(row.egcs_fc_agencychartofaccount), egcs_fc_agencyfiscalyear: String(row.egcs_fc_agencyfiscalyear),
        egcs_fc_periodstart: row.egcs_fc_periodstart, egcs_fc_periodend: row.egcs_fc_periodend, egcs_fc_paidbasis: row.egcs_fc_paidbasis,
        egcs_fc_accountingdimensions: row.egcs_fc_accountingdimensions }))
      const canonical = (rows: typeof retained) => JSON.stringify(rows.toSorted((a, b) => `${a.egcs_fc_commitmentline}:${a.egcs_fc_chartofaccount}:${a.egcs_fc_periodstart}:${a.egcs_fc_periodend}`.localeCompare(`${b.egcs_fc_commitmentline}:${b.egcs_fc_chartofaccount}:${b.egcs_fc_periodstart}:${b.egcs_fc_periodend}`)))
      if (canonical(retained) !== canonical(source.coding)) throw new Error('AR_BASIS_CHANGED')
    }
  }
  for (const partition of coding.filter(row => moneyToCents(row.egcs_fc_amount) > BigInt(0))) {
    const key = (alias: string) => sql<boolean>`${sql.ref(`${alias}.egcs_fc_fundingagreement`)} = ${partition.egcs_fc_fundingagreement}
      AND ${sql.ref(`${alias}.egcs_fc_commitmentline`)} = ${partition.egcs_fc_commitmentline}
      AND ${sql.ref(`${alias}.egcs_fc_chartofaccount`)} = ${partition.egcs_fc_chartofaccount}
      AND ${sql.ref(`${alias}.egcs_fc_agencyfiscalyear`)} = ${partition.egcs_fc_agencyfiscalyear}
      AND ${sql.ref(`${alias}.egcs_fc_periodstart`)} = ${partition.egcs_fc_periodstart}
      AND ${sql.ref(`${alias}.egcs_fc_periodend`)} = ${partition.egcs_fc_periodend}`
    const reservedCoding = await trx.selectFrom('Funding_Case_Agreement_Account_Receivable_Coding as coding')
      .innerJoin('Funding_Case_Agreement_Account_Receivable as root', 'root.id', 'coding.egcs_fc_receivable')
      .select(sql<string>`COALESCE(sum(coding.egcs_fc_amount),0)::text`.as('amount'))
      .where(key('coding')).where('root.egcs_fc_pool', '=', String(debt.egcs_fc_pool)).where('root.egcs_fc_outcome', 'in', ['open', 'posted'])
      .where(eb => eb.or([eb('root.egcs_fc_linkedreceivable', 'is', null), eb('root.egcs_fc_outcome', '=', 'posted'), eb('coding.egcs_fc_amount', '>', 0)]))
      .where('root._deleted', '=', false).where('coding._deleted', '=', false).executeTakeFirstOrThrow()
    const receipts = await trx.selectFrom('Funding_Case_Account_Receivable_Posting as posting')
      .innerJoin('Funding_Case_Account_Receivable_Recovery as recovery', 'recovery.id', 'posting.egcs_fc_recovery')
      .select(sql<string>`COALESCE(sum(posting.egcs_fc_amount),0)::text`.as('amount'))
      .where(key('posting')).where('recovery.egcs_fc_pool', '=', String(debt.egcs_fc_pool)).where('recovery.egcs_fc_outcome', '=', 'posted')
      .where('posting._deleted', '=', false).where('recovery._deleted', '=', false).executeTakeFirstOrThrow()
    if (moneyToCents(subtractMoney(parseDatabaseMoney(reservedCoding.amount), parseDatabaseMoney(receipts.amount))) > moneyToCents(partition.egcs_fc_paidbasis)) throw new Error('AR_CODING_CAPACITY')
  }
  return { debt, lines, coding }
}

export const createAccountReceivable = async (event: H3Event, agreementId: string, input: AccountReceivableCreate) => {
  const context = await authorizeAccountReceivableAgreement(event, agreementId, 'create')
  const agreement = await event.context.$db.selectFrom('Funding_Case_Agreement_Profile').select('egcs_fc_currency').where('id', '=', agreementId).executeTakeFirstOrThrow()
  if (!input.egcs_fc_linkedreceivable) await requireAccountReceivableSourceRead(event, event.context.$db, agreementId)
  return await executeFreshAccountReceivableWrite(event, { agencyId: context.agencyId, applicantRecipientId: input.egcs_fc_applicantrecipient,
    currency: agreement.egcs_fc_currency, agreementIds: [agreementId] }, async (trx, auth, poolId) => {
    const relationship = await trx.selectFrom('Funding_Case_Agreement_Applicant_Recipient').select('id')
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
      || String(original.egcs_fc_agencyfiscalyear) !== input.egcs_fc_agencyfiscalyear || original.egcs_fc_type !== input.egcs_fc_type)) return await accountReceivableError(event, 'AR_INVALID_ADJUSTMENT')
    if (original && moneyToCents(sumMoney((await readAccountReceivableLineBalances(trx, String(original.id))).map(line => line.egcs_fc_outstanding))) <= BigInt(0)) return await accountReceivableError(event, 'AR_CLEARED')
    if (input.egcs_fc_monitorfollowup) {
      if (!auth.userAbilities.authorize('agreement', 'read', context.scope)) return await forbidden(event)
      const followup = await trx.selectFrom('Funding_Case_Agreement_Monitor_Followup as followup')
        .innerJoin('Funding_Case_Agreement_Monitor as monitor', 'monitor.id', 'followup.egcs_fc_fundingagreementmonitor')
        .select('followup.id').where('followup.id', '=', input.egcs_fc_monitorfollowup).where('monitor.egcs_fc_fundingagreement', '=', agreementId)
        .where('followup._deleted', '=', false).where('monitor._deleted', '=', false).executeTakeFirst()
      if (!followup) return await accountReceivableError(event, 'AR_MONITOR_OWNER')
    }
    const debtorLabels = await trx.selectFrom('Applicant_Recipient_Profile').select(['egcs_ar_legalname_en', 'egcs_ar_legalname_fr', 'egcs_ar_operatingname_en', 'egcs_ar_operatingname_fr'])
      .where('id', '=', input.egcs_fc_applicantrecipient).where('_deleted', '=', false).executeTakeFirstOrThrow()
    const yearLabels = await trx.selectFrom('Agency_Fiscal_Year').select('egcs_ay_fiscalyeardisplay').where('id', '=', input.egcs_fc_agencyfiscalyear).executeTakeFirstOrThrow()
    const sources = original
      ? []
      : await readAccountReceivableSources(trx, { agreementId, applicantRecipientId: input.egcs_fc_applicantrecipient,
          agencyFiscalYearId: input.egcs_fc_agencyfiscalyear, type: input.egcs_fc_type, currency: agreement.egcs_fc_currency })
    const selected = original ? [] : sources.filter(source => input.egcs_fc_sources?.includes(source.id) || (input.egcs_fc_type === 'outstanding_advance' && !input.egcs_fc_sources?.length))
    if (!original && (!selected.length || (input.egcs_fc_sources?.length && selected.length !== input.egcs_fc_sources.length))) return await accountReceivableError(event, 'AR_SOURCE_UNAVAILABLE')
    const number = await trx.selectFrom('Funding_Case_Agreement_Account_Receivable').select(eb => eb.fn.max<number>('egcs_fc_number').as('maximum'))
      .where('egcs_fc_fundingagreement', '=', agreementId).executeTakeFirstOrThrow()
    const retainedAgreement = await trx.selectFrom('Funding_Case_Agreement_Profile').select('egcs_fc_agreementnumber').where('id', '=', agreementId).executeTakeFirstOrThrow()
    const created = await trx.insertInto('Funding_Case_Agreement_Account_Receivable').values({
      egcs_fc_fundingagreement: agreementId, egcs_fc_pool: poolId, egcs_fc_applicantrecipient: input.egcs_fc_applicantrecipient,
      egcs_fc_agencyfiscalyear: input.egcs_fc_agencyfiscalyear, egcs_fc_type: input.egcs_fc_type, egcs_fc_currency: agreement.egcs_fc_currency,
      egcs_fc_number: (number.maximum ?? 0) + 1, egcs_fc_agreementnumber: retainedAgreement.egcs_fc_agreementnumber,
      egcs_fc_requesteddate: input.egcs_fc_requesteddate, egcs_fc_recoverymethod: input.egcs_fc_recoverymethod,
      egcs_fc_recipientpreference: input.egcs_fc_recipientpreference ?? null,
      egcs_fc_preferenceoverride_en: input.egcs_fc_preferenceoverride_en, egcs_fc_preferenceoverride_fr: input.egcs_fc_preferenceoverride_fr,
      egcs_fc_narrative_en: input.egcs_fc_narrative_en, egcs_fc_narrative_fr: input.egcs_fc_narrative_fr,
      egcs_fc_linkedreceivable: input.egcs_fc_linkedreceivable ?? null, egcs_fc_monitorfollowup: input.egcs_fc_monitorfollowup ?? null,
      egcs_fc_createdby: creatorId, egcs_fc_status: await lockAgencyDraftStatus(trx, context.agencyId)
    }).returningAll().executeTakeFirstOrThrow()
    await createPrimaryEntityAssignment(trx, 'fundingcaseaccountreceivable', String(created.id), creatorId)
    if (original) {
      const originalLines = await readAccountReceivableLines(trx, String(original.id))
      const originalCoding = await readAccountReceivableCoding(trx, String(original.id))
      for (const line of originalLines) {
        const { id: lineId, ...retained } = line
        const copy = await trx.insertInto('Funding_Case_Agreement_Account_Receivable_Line').values({ ...retained,
          egcs_fc_receivable: String(created.id), egcs_fc_originalline: String(lineId), egcs_fc_sourceamount: databaseMoneyValue(line.egcs_fc_sourceamount), egcs_fc_amount: databaseMoneyValue(ZERO),
          egcs_fc_evidence: sql`${JSON.stringify(line.egcs_fc_evidence)}::jsonb` }).returning('id').executeTakeFirstOrThrow()
        for (const coding of originalCoding.filter(row => String(row.egcs_fc_receivableline) === String(lineId))) {
          const { id: _codingId, ...retainedCoding } = coding
          await trx.insertInto('Funding_Case_Agreement_Account_Receivable_Coding').values({ ...retainedCoding,
            egcs_fc_receivable: String(created.id), egcs_fc_receivableline: String(copy.id), egcs_fc_paidbasis: databaseMoneyValue(coding.egcs_fc_paidbasis), egcs_fc_amount: databaseMoneyValue(ZERO),
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
        egcs_fc_paidbasis: databaseMoneyValue(row.egcs_fc_paidbasis), egcs_fc_amount: databaseMoneyValue(ZERO),
        egcs_fc_accountingdimensions: sql`${JSON.stringify(row.egcs_fc_accountingdimensions)}::jsonb` }).execute()
    }
    return created
  }, { action: 'create', sourceRead: !input.egcs_fc_linkedreceivable })
}

export const editAccountReceivable = async (event: H3Event, id: string, input: AccountReceivableEdit) => {
  const context = await authorizeAccountReceivable(event, id, 'update')
  return await executeFreshAccountReceivableWrite(event, { ...context, agreementIds: [context.agreementId] }, async trx => {
    await assertAccountReceivableEditable(event, trx, id)
    const lines = await readAccountReceivableLines(trx, id)
    if (lines.length !== input.egcs_fc_lines.length || input.egcs_fc_lines.some(line => !lines.some(saved => String(saved.id) === line.id))) return await accountReceivableError(event, 'AR_LINE_SET_STALE')
    const { egcs_fc_lines, ...header } = input
    await trx.updateTable('Funding_Case_Agreement_Account_Receivable').set({ ...header, egcs_fc_recipientpreference: header.egcs_fc_recipientpreference ?? null }).where('id', '=', id).execute()
    const coding = await readAccountReceivableCoding(trx, id)
    for (const line of egcs_fc_lines) {
      const partitions = coding.filter(row => String(row.egcs_fc_receivableline) === line.id)
      let allocated: ReturnType<typeof allocateRetainedAccountReceivableCoding>
      try {
        allocated = allocateRetainedAccountReceivableCoding(line.egcs_fc_amount, partitions.map(row => ({ id: String(row.id), basis: row.egcs_fc_paidbasis, capacity: row.egcs_fc_paidbasis })))
      } catch (error) {
        return await accountReceivableError(event, error instanceof Error ? error.message : 'AR_CODING_CAPACITY')
      }
      await trx.updateTable('Funding_Case_Agreement_Account_Receivable_Line').set({ egcs_fc_amount: databaseMoneyValue(line.egcs_fc_amount) }).where('id', '=', line.id).execute()
      for (const split of allocated) await trx.updateTable('Funding_Case_Agreement_Account_Receivable_Coding').set({ egcs_fc_amount: databaseMoneyValue(split.amount) }).where('id', '=', split.id).execute()
    }
    try {
      await validateAccountReceivableBasis(trx, id)
    } catch (error) {
      return await accountReceivableError(event, error instanceof Error ? error.message : 'AR_INVALID_BASIS')
    }
    return await trx.selectFrom('Funding_Case_Agreement_Account_Receivable').selectAll().where('id', '=', id).executeTakeFirstOrThrow()
  }, { target: { entityType: 'fundingcaseaccountreceivable', entityId: id } })
}

export const deleteAccountReceivable = async (event: H3Event, id: string) => {
  const context = await authorizeAccountReceivable(event, id, 'delete')
  return await executeFreshAccountReceivableWrite(event, { ...context, agreementIds: [context.agreementId] }, async trx => {
    const row = await assertAccountReceivableEditable(event, trx, id)
    if (!row.egcs_cn_isdraft) return await accountReceivableError(event, 'AR_DELETE_DRAFT_ONLY')
    const workflow = await trx.selectFrom('Common_Runtime').select('id').where('egcs_cn_entitytype', '=', 'fundingcaseaccountreceivable').where('egcs_cn_entityid', '=', id).executeTakeFirst()
    const attachments = await trx.selectFrom('Common_Entity_Attachment').select('id').where('egcs_cn_entitytype', '=', 'fundingcaseaccountreceivable').where('egcs_cn_entityid', '=', id).where('_deleted', '=', false).executeTakeFirst()
    if (workflow || attachments) return await accountReceivableError(event, 'AR_RETAINED_EVIDENCE')
    await trx.updateTable('Funding_Case_Agreement_Account_Receivable').set({ _deleted: true }).where('id', '=', id).execute()
    await trx.updateTable('Common_Entity_Assignment').set({ _deleted: true }).where('egcs_cn_entitytype', '=', 'fundingcaseaccountreceivable').where('egcs_cn_entityid', '=', id).execute()
    return { success: true }
  }, { action: 'delete', target: { entityType: 'fundingcaseaccountreceivable', entityId: id } })
}

export const getAccountReceivableDetail = async (event: H3Event, id: string) => {
  const context = await authorizeAccountReceivable(event, id)
  const auth = await requireAuthContext(event)
  const db = event.context.$db
  const debt = await db.selectFrom('Funding_Case_Agreement_Account_Receivable').selectAll().where('id', '=', id).where('_deleted', '=', false).executeTakeFirstOrThrow()
  const [lines, coding, status, completion, assignment] = await Promise.all([readAccountReceivableLineBalances(db, debt.egcs_fc_linkedreceivable ? String(debt.egcs_fc_linkedreceivable) : id),
    readAccountReceivableCoding(db, id), db.selectFrom('Common_Status').select(['egcs_cn_terminal', 'egcs_cn_readonly', 'egcs_cn_isdraft']).where('id', '=', debt.egcs_fc_status).executeTakeFirstOrThrow(),
    resolveCompletionEvidenceId(db, 'fundingcaseaccountreceivable', id), resolveAssignedItemTargetGrant(auth.userId, { entityType: 'fundingcaseaccountreceivable', entityId: id }, db)])
  const savedLines = debt.egcs_fc_linkedreceivable ? await readAccountReceivableLines(db, id) : lines
  const principal = sumMoney(lines.map(line => line.egcs_fc_principal))
  const recovered = sumMoney(lines.map(line => line.egcs_fc_recovered))
  const reserved = sumMoney(lines.map(line => line.egcs_fc_reserved))
  const outstanding = subtractMoney(principal, recovered)
  const editable = debt.egcs_fc_outcome === 'open' && !status.egcs_cn_terminal && !status.egcs_cn_readonly && !completion
  const assigned = Boolean(assignment)
  const work = assigned && auth.userAbilities.authorize('account_receivable', 'update', context.scope)
  const [record] = await withBusinessRecordState(db, 'fundingcaseaccountreceivable', [debt])
  const history = await db.selectFrom('Funding_Case_Account_Receivable_Allocation as allocation')
    .innerJoin('Funding_Case_Account_Receivable_Recovery as recovery', 'recovery.id', 'allocation.egcs_fc_recovery')
    .select(['allocation.id', 'allocation.egcs_fc_recovery', 'allocation.egcs_fc_receivableline', 'recovery.egcs_fc_payment', 'recovery.egcs_fc_creditmemo', 'recovery.egcs_fc_outcome', 'recovery.egcs_fc_createdat', 'recovery.egcs_fc_postedat',
      databaseMoneyText(sql.ref('allocation.egcs_fc_amount')).as('egcs_fc_amount')])
    .where('allocation.egcs_fc_receivable', '=', debt.egcs_fc_linkedreceivable ? String(debt.egcs_fc_linkedreceivable) : id).where('allocation._deleted', '=', false).orderBy('allocation.id').execute()
  const labels = (savedLines[0]?.egcs_fc_evidence ?? {}) as Record<string, JsonValue>
  const effectiveRecoveryMethod = await readAccountReceivableApprovedRecoveryMethod(db, id)
  const adjustments = await db.selectFrom('Funding_Case_Agreement_Account_Receivable').selectAll().where('egcs_fc_linkedreceivable', '=', id).where('_deleted', '=', false).orderBy('egcs_fc_number').execute()
  const projectedAdjustments = await Promise.all(adjustments.map(async adjustment => ({ ...adjustment,
    egcs_fc_effectiverecoverymethod: effectiveRecoveryMethod,
    egcs_fc_principal: adjustment.egcs_fc_outcome === 'posted' ? sumMoney((await readAccountReceivableLines(db, String(adjustment.id))).map(line => line.egcs_fc_amount)) : ZERO,
    egcs_fc_recovered: ZERO, egcs_fc_reserved: ZERO, egcs_fc_outstanding: ZERO, egcs_fc_available: ZERO, egcs_fc_collectionstate: 'cleared' as const,
    egcs_fc_debtorname_en: String(labels.egcs_fc_debtorname_en ?? ''), egcs_fc_debtorname_fr: String(labels.egcs_fc_debtorname_fr ?? ''), egcs_fc_fiscalyeardisplay: String(labels.egcs_fc_fiscalyeardisplay ?? '') })))
  return { ...record, egcs_fc_lines: savedLines.map(line => ({ ...line, egcs_fc_coding: coding.filter(row => String(row.egcs_fc_receivableline) === String(line.id)) })), egcs_fc_coding: coding,
    egcs_fc_effectiverecoverymethod: effectiveRecoveryMethod,
    egcs_fc_adjustments: await withBusinessRecordState(db, 'fundingcaseaccountreceivable', projectedAdjustments), egcs_fc_principal: principal, egcs_fc_recovered: recovered,
    egcs_fc_reserved: reserved, egcs_fc_outstanding: outstanding, egcs_fc_available: subtractMoney(outstanding, reserved),
    egcs_fc_debtorname_en: String(labels.egcs_fc_debtorname_en ?? ''), egcs_fc_debtorname_fr: String(labels.egcs_fc_debtorname_fr ?? ''), egcs_fc_fiscalyeardisplay: String(labels.egcs_fc_fiscalyeardisplay ?? ''),
    egcs_fc_collectionstate: moneyToCents(outstanding) === BigInt(0) ? 'cleared' : moneyToCents(recovered) > BigInt(0) ? 'partially_recovered' : 'outstanding',
    egcs_fc_recoveries: history.map(row => ({ ...row, egcs_fc_amount: parseDatabaseMoney(row.egcs_fc_amount), egcs_fc_creditmemoreference: formatAccountReceivableCreditMemoSettlementReference(String(row.egcs_fc_recovery)) })),
    egcs_fc_canedit: editable && work, egcs_fc_canwork: work && debt.egcs_fc_outcome === 'open',
    egcs_fc_candelete: editable && status.egcs_cn_isdraft && assigned && auth.userAbilities.authorize('account_receivable', 'delete', context.scope),
    egcs_fc_cancancel: work && debt.egcs_fc_outcome === 'open', egcs_fc_canlink: debt.egcs_fc_outcome === 'posted' && !debt.egcs_fc_linkedreceivable && moneyToCents(outstanding) > BigInt(0) && auth.userAbilities.authorize('account_receivable', 'create', context.scope),
    egcs_fc_canadjust: debt.egcs_fc_outcome === 'posted' && !debt.egcs_fc_linkedreceivable && moneyToCents(outstanding) > BigInt(0) && auth.userAbilities.authorize('account_receivable', 'create', context.scope),
    egcs_fc_cancreditmemo: debt.egcs_fc_outcome === 'posted' && !debt.egcs_fc_linkedreceivable && moneyToCents(subtractMoney(outstanding, reserved)) > BigInt(0) && auth.userAbilities.authorize('account_receivable', 'create', context.scope),
    egcs_fc_agreementreadable: auth.userAbilities.authorize('agreement', 'read', context.scope),
    egcs_fc_sourcereadable: auth.userAbilities.authorize('agreement', 'read', context.scope) }
}

export const listAccountReceivables = async (event: H3Event, agreementId: string, input: { page: number; limit: number; search?: string }) => {
  const context = await authorizeAccountReceivableAgreement(event, agreementId)
  const auth = await requireAuthContext(event)
  let query = event.context.$db.selectFrom('Funding_Case_Agreement_Account_Receivable').where('egcs_fc_fundingagreement', '=', agreementId).where('_deleted', '=', false)
  if (input.search) query = query.where(eb => eb.or([eb('egcs_fc_narrative_en', 'ilike', `%${input.search}%`), eb('egcs_fc_narrative_fr', 'ilike', `%${input.search}%`)]))
  const ids = await query.select('id').orderBy('egcs_fc_number', 'desc').limit(input.limit).offset((input.page - 1) * input.limit).execute()
  const count = await query.select(sql<string>`count(*)::text`.as('total')).executeTakeFirstOrThrow()
  const agreement = await event.context.$db.selectFrom('Funding_Case_Agreement_Profile').select('egcs_fc_agreementnumber').where('id', '=', agreementId).executeTakeFirstOrThrow()
  const items = await Promise.all(ids.map(async row => {
    const detail = await getAccountReceivableDetail(event, String(row.id))
    if (!detail.egcs_fc_linkedreceivable) return detail
    return { ...detail, egcs_fc_principal: detail.egcs_fc_outcome === 'posted' ? sumMoney(detail.egcs_fc_lines.map(line => line.egcs_fc_amount)) : ZERO,
      egcs_fc_recovered: ZERO, egcs_fc_reserved: ZERO, egcs_fc_outstanding: ZERO, egcs_fc_available: ZERO, egcs_fc_collectionstate: 'cleared' as const }
  }))
  return { items, total: Number(count.total), page: input.page, limit: input.limit, ...agreement,
    egcs_fc_cancreate: auth.userAbilities.authorize('account_receivable', 'create', context.scope) }
}
