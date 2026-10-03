/* eslint-disable jsdoc/require-jsdoc -- Independently assigned repayment aggregate validates every included Agreement scope. */
import type { H3Event } from 'h3'
import { sql, type Kysely, type Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { AbilityAction } from '~~/shared/utils/abilities'
import type { AccountReceivableCreditMemoCreate, AccountReceivableCreditMemoEdit } from '~~/shared/types/schemas/account-receivable'
import { moneyToCents, sumMoney } from '~~/shared/utils/money'
import { formatAccountReceivableCreditMemoSettlementReference } from '~~/shared/utils/account-receivable'
import { authorize, authorizeWithFreshAuthContext, requireAuthContext, type AuthContext } from './authorize'
import { forbidden, notFound } from './api-errors'
import { resolveAgreementScopeContext } from './agreement'
import { accountReceivableError } from './account-receivable-source'
import { executeFreshAccountReceivableWrite, resolveAccountReceivableCreditMemoRuntimeContext } from './account-receivable-context'
import { createPrimaryEntityAssignment, resolveAssignmentCommonUserId } from './entity-assignment'
import { lockAgencyDraftStatus } from './business-status-runtime'
import { resolveCompletionEvidenceId } from './completion-runtime-core'
import { databaseMoneyText, databaseMoneyValue, parseDatabaseMoney } from './database-money'
import { readAccountReceivableLineBalances } from './account-receivable'
import { readAccountReceivableRecoveryAllocations, validateAccountReceivableRecovery } from './account-receivable-recovery'
import { withBusinessRecordState } from './business-record-state'
import { resolveAssignedItemTargetGrant } from './rbac'

export const assertAccountReceivableCreditMemoScopeAuthority = async (event: H3Event, db: Kysely<Database>, auth: AuthContext, id: string, action: AbilityAction | 'manage_assignments') => {
  const context = await resolveAccountReceivableCreditMemoRuntimeContext(db, id)
  if (!context) return await notFound(event, 'ACCOUNT_RECEIVABLE_REPAYMENT_NOT_FOUND', 'apiErrors.account_receivable.not_found')
  const contexts = []
  for (const agreementId of context.agreementIds) {
    const owner = await resolveAgreementScopeContext(agreementId, db)
    if (!owner || owner.agencyId !== context.agencyId) return await forbidden(event)
    if (action === 'manage_assignments') {
      if (!auth.userAbilities.canManageAssignments('account_receivable', owner.scope)) return await forbidden(event)
    } else await authorizeWithFreshAuthContext(event, auth, 'account_receivable', action, owner.scope)
    contexts.push(owner)
  }
  return { ...context, contexts }
}

export const authorizeAccountReceivableCreditMemo = async (event: H3Event, id: string, action: 'read' | 'update' | 'delete' = 'read') => {
  const context = await resolveAccountReceivableCreditMemoRuntimeContext(event.context.$db, id)
  if (!context) return await notFound(event, 'ACCOUNT_RECEIVABLE_REPAYMENT_NOT_FOUND', 'apiErrors.account_receivable.not_found')
  const auth = await authorize(event, 'account_receivable', action, context.scope)
  return await assertAccountReceivableCreditMemoScopeAuthority(event, event.context.$db, auth, id, action)
}

const resolveRepaymentInputs = async (event: H3Event, db: Kysely<Database>, input: AccountReceivableCreditMemoCreate) => {
  const ids = input.egcs_fc_allocations.map(row => row.egcs_fc_receivableline)
  const rows = await db.selectFrom('Funding_Case_Agreement_Account_Receivable_Line as line')
    .innerJoin('Funding_Case_Agreement_Account_Receivable as debt', 'debt.id', 'line.egcs_fc_receivable')
    .innerJoin('Funding_Case_Account_Receivable_Pool as pool', 'pool.id', 'debt.egcs_fc_pool')
    .select(['line.id', 'debt.id as receivableId', 'debt.egcs_fc_fundingagreement', 'debt.egcs_fc_pool', 'debt.egcs_fc_currency', 'debt.egcs_fc_applicantrecipient', 'debt.egcs_fc_outcome', 'debt.egcs_fc_linkedreceivable', 'pool.egcs_fc_agency'])
    .where('line.id', 'in', ids).where('line._deleted', '=', false).where('debt._deleted', '=', false).execute()
  const first = rows[0]
  if (!first || rows.length !== ids.length || rows.some(row => row.egcs_fc_outcome !== 'posted' || row.egcs_fc_linkedreceivable
    || String(row.egcs_fc_applicantrecipient) !== input.egcs_fc_applicantrecipient || row.egcs_fc_currency !== first.egcs_fc_currency
    || String(row.egcs_fc_pool) !== String(first.egcs_fc_pool))) return await accountReceivableError(event, 'AR_REPAYMENT_OWNER')
  const agreementIds = [...new Set(rows.map(row => String(row.egcs_fc_fundingagreement)))].sort((a, b) => BigInt(a) < BigInt(b) ? -1 : 1)
  for (const agreementId of agreementIds) {
    const context = await resolveAgreementScopeContext(agreementId, db)
    if (!context || context.agencyId !== String(first.egcs_fc_agency)) return await forbidden(event)
    await authorize(event, 'account_receivable', 'create', context.scope)
  }
  return { rows, agreementIds, agencyId: String(first.egcs_fc_agency), currency: first.egcs_fc_currency, applicantRecipientId: input.egcs_fc_applicantrecipient }
}

const writeRepaymentAllocations = async (event: H3Event, trx: Transaction<Database>, repaymentId: string, poolId: string,
  input: AccountReceivableCreditMemoCreate, rows: Awaited<ReturnType<typeof resolveRepaymentInputs>>['rows']) => {
  if (sumMoney(input.egcs_fc_allocations.map(row => row.egcs_fc_amount)) !== input.egcs_fc_amount) return await accountReceivableError(event, 'AR_ALLOCATION_TOTAL')
  const unresolved = await trx.selectFrom('Funding_Case_Account_Receivable_Recovery').select(['id', 'egcs_fc_creditmemo'])
    .where('egcs_fc_pool', '=', poolId).where('egcs_fc_outcome', '=', 'open').where('_deleted', '=', false).forUpdate().executeTakeFirst()
  if (unresolved && String(unresolved.egcs_fc_creditmemo) !== repaymentId) return await accountReceivableError(event, 'AR_RECOVERY_UNRESOLVED')
  if (unresolved) await trx.updateTable('Funding_Case_Account_Receivable_Recovery').set({ egcs_fc_outcome: 'released', egcs_fc_releasedat: new Date() }).where('id', '=', String(unresolved.id)).execute()
  for (const allocation of input.egcs_fc_allocations) {
    const source = rows.find(row => String(row.id) === allocation.egcs_fc_receivableline)!
    const line = (await readAccountReceivableLineBalances(trx, String(source.receivableId))).find(item => String(item.id) === allocation.egcs_fc_receivableline)
    if (!line) return await accountReceivableError(event, 'AR_ALLOCATION_SOURCE')
    if (moneyToCents(allocation.egcs_fc_amount) > moneyToCents(line.egcs_fc_available)) return await accountReceivableError(event, 'AR_ALLOCATION_CAPACITY')
  }
  const recovery = await trx.insertInto('Funding_Case_Account_Receivable_Recovery').values({ egcs_fc_pool: poolId, egcs_fc_payment: null,
    egcs_fc_creditmemo: repaymentId, egcs_fc_amount: databaseMoneyValue(input.egcs_fc_amount) }).returning('id').executeTakeFirstOrThrow()
  await trx.insertInto('Funding_Case_Account_Receivable_Allocation').values(input.egcs_fc_allocations.map(row => {
    const source = rows.find(item => String(item.id) === row.egcs_fc_receivableline)!
    return { egcs_fc_recovery: String(recovery.id), egcs_fc_receivable: String(source.receivableId), egcs_fc_receivableline: row.egcs_fc_receivableline,
      egcs_fc_fundingagreement: String(source.egcs_fc_fundingagreement), egcs_fc_amount: databaseMoneyValue(row.egcs_fc_amount) }
  })).execute()
  try {
    await validateAccountReceivableRecovery(trx, String(recovery.id))
  } catch (error) {
    return await accountReceivableError(event, error instanceof Error ? error.message : 'AR_REPAYMENT_INVALID')
  }
}

export const createAccountReceivableCreditMemo = async (event: H3Event, input: AccountReceivableCreditMemoCreate) => {
  const context = await resolveRepaymentInputs(event, event.context.$db, input)
  return await executeFreshAccountReceivableWrite(event, context, async (trx, auth, poolId) => {
    const fresh = await resolveRepaymentInputs(event, trx, input)
    const creatorId = await resolveAssignmentCommonUserId(trx, auth.userId)
    if (!creatorId) return await forbidden(event)
    const anchor = context.agreementIds[0]!
    const agreement = await trx.selectFrom('Funding_Case_Agreement_Profile').select('egcs_fc_agreementnumber').where('id', '=', anchor).executeTakeFirstOrThrow()
    const number = await trx.selectFrom('Funding_Case_Account_Receivable_Credit_Memo').select(eb => eb.fn.max<number>('egcs_fc_number').as('maximum')).where('egcs_fc_agency', '=', context.agencyId).executeTakeFirstOrThrow()
    const created = await trx.insertInto('Funding_Case_Account_Receivable_Credit_Memo').values({ egcs_fc_fundingagreement: anchor,
      egcs_fc_agency: context.agencyId, egcs_fc_pool: poolId, egcs_fc_applicantrecipient: input.egcs_fc_applicantrecipient, egcs_fc_currency: context.currency,
      egcs_fc_number: (number.maximum ?? 0) + 1, egcs_fc_agreementnumber: agreement.egcs_fc_agreementnumber,
      egcs_fc_receiveddate: input.egcs_fc_receiveddate, egcs_fc_amount: databaseMoneyValue(input.egcs_fc_amount),
      egcs_fc_receiptreference: input.egcs_fc_receiptreference ?? null, egcs_fc_narrative_en: input.egcs_fc_narrative_en,
      egcs_fc_narrative_fr: input.egcs_fc_narrative_fr, egcs_fc_createdby: creatorId,
      egcs_fc_status: await lockAgencyDraftStatus(trx, context.agencyId) }).returningAll().executeTakeFirstOrThrow()
    await createPrimaryEntityAssignment(trx, 'fundingcaseaccountreceivablecreditmemo', String(created.id), creatorId)
    await writeRepaymentAllocations(event, trx, String(created.id), poolId, input, fresh.rows)
    return { ...created, egcs_fc_amount: input.egcs_fc_amount }
  }, { action: 'create' })
}

export const assertAccountReceivableCreditMemoEditable = async (event: H3Event, trx: Transaction<Database>, id: string) => {
  const row = await trx.selectFrom('Funding_Case_Account_Receivable_Credit_Memo as repayment')
    .innerJoin('Common_Status as status', 'status.id', 'repayment.egcs_fc_status').selectAll('repayment')
    .select(['status.egcs_cn_terminal', 'status.egcs_cn_readonly', 'status.egcs_cn_isdraft']).where('repayment.id', '=', id)
    .where('repayment._deleted', '=', false).where('status._deleted', '=', false).forUpdate(['repayment', 'status']).executeTakeFirstOrThrow()
  if (row.egcs_fc_outcome !== 'open' || row.egcs_cn_terminal || row.egcs_cn_readonly
    || await resolveCompletionEvidenceId(trx, 'fundingcaseaccountreceivablecreditmemo', id)) return await accountReceivableError(event, 'AR_REPAYMENT_IMMUTABLE')
  return row
}

export const editAccountReceivableCreditMemo = async (event: H3Event, id: string, input: AccountReceivableCreditMemoEdit) => {
  const context = await authorizeAccountReceivableCreditMemo(event, id, 'update')
  const requested = await resolveRepaymentInputs(event, event.context.$db, input)
  if (requested.agencyId !== context.agencyId || requested.currency !== context.currency || requested.applicantRecipientId !== context.applicantRecipientId) return await accountReceivableError(event, 'AR_REPAYMENT_OWNER')
  return await executeFreshAccountReceivableWrite(event, { ...context, agreementIds: [...new Set([...context.agreementIds, ...requested.agreementIds])] }, async (trx, auth, poolId) => {
    await assertAccountReceivableCreditMemoScopeAuthority(event, trx, auth, id, 'update')
    await assertAccountReceivableCreditMemoEditable(event, trx, id)
    const fresh = await resolveRepaymentInputs(event, trx, input)
    await trx.updateTable('Funding_Case_Account_Receivable_Credit_Memo').set({ egcs_fc_receiveddate: input.egcs_fc_receiveddate,
      egcs_fc_amount: databaseMoneyValue(input.egcs_fc_amount), egcs_fc_receiptreference: input.egcs_fc_receiptreference ?? null,
      egcs_fc_narrative_en: input.egcs_fc_narrative_en, egcs_fc_narrative_fr: input.egcs_fc_narrative_fr }).where('id', '=', id).execute()
    await writeRepaymentAllocations(event, trx, id, poolId, input, fresh.rows)
    return { id }
  }, { target: { entityType: 'fundingcaseaccountreceivablecreditmemo', entityId: id } })
}

export const deleteAccountReceivableCreditMemo = async (event: H3Event, id: string) => {
  const context = await authorizeAccountReceivableCreditMemo(event, id, 'delete')
  return await executeFreshAccountReceivableWrite(event, context, async (trx, auth) => {
    await assertAccountReceivableCreditMemoScopeAuthority(event, trx, auth, id, 'delete')
    const row = await assertAccountReceivableCreditMemoEditable(event, trx, id)
    const attachment = await trx.selectFrom('Common_Entity_Attachment').select('id').where('egcs_cn_entitytype', '=', 'fundingcaseaccountreceivablecreditmemo').where('egcs_cn_entityid', '=', id).where('_deleted', '=', false).executeTakeFirst()
    const workflow = await trx.selectFrom('Common_Runtime').select('id').where('egcs_cn_entitytype', '=', 'fundingcaseaccountreceivablecreditmemo').where('egcs_cn_entityid', '=', id).executeTakeFirst()
    if (!row.egcs_cn_isdraft || attachment || workflow) return await accountReceivableError(event, 'AR_RETAINED_EVIDENCE')
    await trx.updateTable('Funding_Case_Account_Receivable_Recovery').set({ egcs_fc_outcome: 'released', egcs_fc_releasedat: new Date() }).where('egcs_fc_creditmemo', '=', id).where('egcs_fc_outcome', '=', 'open').execute()
    await trx.updateTable('Funding_Case_Account_Receivable_Credit_Memo').set({ _deleted: true }).where('id', '=', id).execute()
    await trx.updateTable('Common_Entity_Assignment').set({ _deleted: true }).where('egcs_cn_entitytype', '=', 'fundingcaseaccountreceivablecreditmemo').where('egcs_cn_entityid', '=', id).execute()
    return { success: true }
  }, { action: 'delete', target: { entityType: 'fundingcaseaccountreceivablecreditmemo', entityId: id } })
}

export const getAccountReceivableCreditMemoDetail = async (event: H3Event, id: string) => {
  const context = await authorizeAccountReceivableCreditMemo(event, id)
  const auth = await requireAuthContext(event)
  const db = event.context.$db
  const repayment = await db.selectFrom('Funding_Case_Account_Receivable_Credit_Memo').selectAll()
    .select(databaseMoneyText(sql.ref('egcs_fc_amount')).as('egcs_fc_amount')).where('id', '=', id).where('_deleted', '=', false).executeTakeFirstOrThrow()
  const recovery = await db.selectFrom('Funding_Case_Account_Receivable_Recovery').select('id').where('egcs_fc_creditmemo', '=', id).where('_deleted', '=', false).orderBy('id', 'desc').executeTakeFirst()
  const allocations = recovery ? await readAccountReceivableRecoveryAllocations(db, String(recovery.id)) : []
  const status = await db.selectFrom('Common_Status').select(['egcs_cn_terminal', 'egcs_cn_readonly', 'egcs_cn_isdraft']).where('id', '=', repayment.egcs_fc_status).executeTakeFirstOrThrow()
  const assignment = await resolveAssignedItemTargetGrant(auth.userId, { entityType: 'fundingcaseaccountreceivablecreditmemo', entityId: id }, db)
  const editable = repayment.egcs_fc_outcome === 'open' && !status.egcs_cn_terminal && !status.egcs_cn_readonly && !await resolveCompletionEvidenceId(db, 'fundingcaseaccountreceivablecreditmemo', id)
  const work = Boolean(assignment) && context.contexts.every(owner => auth.userAbilities.authorize('account_receivable', 'update', owner.scope))
  const [record] = await withBusinessRecordState(db, 'fundingcaseaccountreceivablecreditmemo', [repayment])
  const firstAllocation = allocations[0]
  const firstLine = firstAllocation ? await db.selectFrom('Funding_Case_Agreement_Account_Receivable_Line').select('egcs_fc_evidence').where('id', '=', String(firstAllocation.egcs_fc_receivableline)).executeTakeFirst() : null
  const labels = (firstLine?.egcs_fc_evidence ?? {}) as Record<string, unknown>
  return { ...record, egcs_fc_amount: parseDatabaseMoney(repayment.egcs_fc_amount), egcs_fc_allocations: allocations,
    egcs_fc_creditmemoreference: recovery ? formatAccountReceivableCreditMemoSettlementReference(String(recovery.id)) : null,
    egcs_fc_debtorname_en: String(labels.egcs_fc_debtorname_en ?? ''), egcs_fc_debtorname_fr: String(labels.egcs_fc_debtorname_fr ?? ''),
    egcs_fc_canedit: editable && work, egcs_fc_canwork: work && repayment.egcs_fc_outcome === 'open',
    egcs_fc_cancancel: work && repayment.egcs_fc_outcome === 'open', egcs_fc_candelete: editable && Boolean(assignment)
      && status.egcs_cn_isdraft && context.contexts.every(owner => auth.userAbilities.authorize('account_receivable', 'delete', owner.scope)),
    egcs_fc_agreementreadable: context.contexts.every(owner => auth.userAbilities.authorize('agreement', 'read', owner.scope)) }
}
