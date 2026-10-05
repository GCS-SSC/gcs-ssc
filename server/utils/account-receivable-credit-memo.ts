/* eslint-disable jsdoc/require-jsdoc -- Independently assigned repayment aggregate validates every included Agreement scope. */
import type { H3Event } from 'h3'
import { sql, type Kysely, type Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { AbilityAction } from '~~/shared/utils/abilities'
import type { AccountReceivableCreditMemoCreate, AccountReceivableCreditMemoEdit } from '~~/shared/types/schemas/account-receivable'
import { formatAccountReceivableCreditMemoSettlementReference } from '~~/shared/utils/account-receivable'
import { authorize, authorizeWithFreshAuthContext, requireAuthContext, type AuthContext } from './authorize'
import { forbidden, notFound } from './api-errors'
import { accountReceivableError } from './account-receivable-source'
import { executeFreshAccountReceivableWrite, resolveAccountReceivableCreditMemoRuntimeContext } from './account-receivable-context'
import { createPrimaryEntityAssignment, resolveAssignmentCommonUserId } from './entity-assignment'
import { lockAgencyDraftStatus } from './business-status-runtime'
import { resolveCompletionEvidenceId } from './completion-runtime-core'
import { databaseMoneyText, databaseMoneyValue, parseDatabaseMoney } from './database-money'
import { canAccessApplicantRecipient } from './applicant-recipient-auth'
import { withBusinessRecordState } from './business-record-state'
import { resolveAssignedItemTargetGrant } from './rbac'

export const assertAccountReceivableCreditMemoScopeAuthority = async (event: H3Event, db: Kysely<Database>, auth: AuthContext, id: string, action: AbilityAction | 'manage_assignments') => {
  const context = await resolveAccountReceivableCreditMemoRuntimeContext(db, id)
  if (!context) return await notFound(event, 'ACCOUNT_RECEIVABLE_REPAYMENT_NOT_FOUND', 'apiErrors.account_receivable.not_found')
  if (action === 'manage_assignments') {
    if (!auth.userAbilities.canManageAssignments('account_receivable', context.scope)) return await forbidden(event)
  } else await authorizeWithFreshAuthContext(event, auth, 'account_receivable', action, context.scope)
  const contexts = [{ scope: context.scope }]
  return { ...context, contexts }
}

export const authorizeAccountReceivableCreditMemo = async (event: H3Event, id: string, action: 'read' | 'update' | 'delete' = 'read') => {
  const context = await resolveAccountReceivableCreditMemoRuntimeContext(event.context.$db, id)
  if (!context) return await notFound(event, 'ACCOUNT_RECEIVABLE_REPAYMENT_NOT_FOUND', 'apiErrors.account_receivable.not_found')
  const auth = await authorize(event, 'account_receivable', action, context.scope)
  return await assertAccountReceivableCreditMemoScopeAuthority(event, event.context.$db, auth, id, action)
}

const resolveRepaymentInputs = async (event: H3Event, db: Kysely<Database>, input: AccountReceivableCreditMemoCreate) => {
  await authorize(event, 'account_receivable', 'create', { type: 'agency', agencyId: input.egcs_fc_agency })
  const proponent = await db.selectFrom('Applicant_Recipient_Profile').select('id').where('id', '=', input.egcs_fc_applicantrecipient)
    .where('egcs_ar_active', '=', true).where('_deleted', '=', false).forShare().executeTakeFirst()
  const agency = await db.selectFrom('Agency_Profile').select('id').where('id', '=', input.egcs_fc_agency).where('egcs_ay_active', '=', true).where('_deleted', '=', false).executeTakeFirst()
  if (!proponent || !agency) return await accountReceivableError(event, 'AR_REPAYMENT_OWNER')
  return { agreementIds: [] as string[], agencyId: input.egcs_fc_agency, currency: input.egcs_fc_currency, applicantRecipientId: input.egcs_fc_applicantrecipient }
}

export const createAccountReceivableCreditMemo = async (event: H3Event, input: AccountReceivableCreditMemoCreate) => {
  const context = await resolveRepaymentInputs(event, event.context.$db, input)
  return await executeFreshAccountReceivableWrite(event, context, async (trx, auth, poolId) => {
    await resolveRepaymentInputs(event, trx, input)
    const creatorId = await resolveAssignmentCommonUserId(trx, auth.userId)
    if (!creatorId) return await forbidden(event)
    // Different Proponents have different pool locks; serialize the Agency's memo sequence too.
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`gcs-cash-memo-sequence:${context.agencyId}`},0))`.execute(trx)
    const sequence = await trx.selectFrom('Funding_Case_Account_Receivable_Credit_Memo').select(eb => eb.fn.max<number>('egcs_fc_number').as('maximum'))
      .where('egcs_fc_agency', '=', context.agencyId).executeTakeFirstOrThrow()
    const created = await trx.insertInto('Funding_Case_Account_Receivable_Credit_Memo').values({
      egcs_fc_fundingagreement: null, egcs_fc_agreementnumber: null, egcs_fc_ledgerkind: 'pool',
      egcs_fc_agency: context.agencyId, egcs_fc_pool: poolId, egcs_fc_applicantrecipient: input.egcs_fc_applicantrecipient,
      egcs_fc_currency: context.currency, egcs_fc_number: (sequence.maximum ?? 0) + 1,
      egcs_fc_receiveddate: input.egcs_fc_receiveddate, egcs_fc_amount: databaseMoneyValue(input.egcs_fc_amount),
      egcs_fc_receiptreference: input.egcs_fc_receiptreference ?? null, egcs_fc_narrative_en: input.egcs_fc_narrative_en,
      egcs_fc_narrative_fr: input.egcs_fc_narrative_fr, egcs_fc_createdby: creatorId,
      egcs_fc_status: await lockAgencyDraftStatus(trx, context.agencyId) }).returningAll().executeTakeFirstOrThrow()
    await createPrimaryEntityAssignment(trx, 'fundingcaseaccountreceivablecreditmemo', String(created.id), creatorId)
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
  if (input.egcs_fc_agency !== context.agencyId || input.egcs_fc_currency !== context.currency || input.egcs_fc_applicantrecipient !== context.applicantRecipientId) return await accountReceivableError(event, 'AR_REPAYMENT_OWNER')
  return await executeFreshAccountReceivableWrite(event, context, async (trx, auth) => {
    await assertAccountReceivableCreditMemoScopeAuthority(event, trx, auth, id, 'update')
    const row = await assertAccountReceivableCreditMemoEditable(event, trx, id)
    if (row.egcs_fc_ledgerkind === 'legacy') return await accountReceivableError(event, 'AR_RETAINED_EVIDENCE')
    await trx.updateTable('Funding_Case_Account_Receivable_Credit_Memo').set({ egcs_fc_receiveddate: input.egcs_fc_receiveddate,
      egcs_fc_amount: databaseMoneyValue(input.egcs_fc_amount), egcs_fc_receiptreference: input.egcs_fc_receiptreference ?? null,
      egcs_fc_narrative_en: input.egcs_fc_narrative_en, egcs_fc_narrative_fr: input.egcs_fc_narrative_fr }).where('id', '=', id).execute()
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
  const status = await db.selectFrom('Common_Status').select(['egcs_cn_terminal', 'egcs_cn_readonly', 'egcs_cn_isdraft']).where('id', '=', repayment.egcs_fc_status).executeTakeFirstOrThrow()
  const assignment = await resolveAssignedItemTargetGrant(auth.userId, { entityType: 'fundingcaseaccountreceivablecreditmemo', entityId: id }, db)
  const editable = repayment.egcs_fc_outcome === 'open' && !status.egcs_cn_terminal && !status.egcs_cn_readonly && !await resolveCompletionEvidenceId(db, 'fundingcaseaccountreceivablecreditmemo', id)
  const work = Boolean(assignment) && context.contexts.every(owner => auth.userAbilities.authorize('account_receivable', 'update', owner.scope))
  const [record] = await withBusinessRecordState(db, 'fundingcaseaccountreceivablecreditmemo', [repayment])
  const proponent = await db.selectFrom('Applicant_Recipient_Profile').select(['egcs_ar_legalname_en', 'egcs_ar_legalname_fr']).where('id', '=', repayment.egcs_fc_applicantrecipient).executeTakeFirstOrThrow()
  const agency = await db.selectFrom('Agency_Profile').select(['egcs_ay_name_en', 'egcs_ay_name_fr']).where('id', '=', repayment.egcs_fc_agency).executeTakeFirstOrThrow()
  return { ...record, egcs_fc_amount: parseDatabaseMoney(repayment.egcs_fc_amount),
    egcs_fc_creditmemoreference: recovery ? formatAccountReceivableCreditMemoSettlementReference(String(recovery.id)) : `CM-${repayment.id}`,
    egcs_fc_debtorname_en: proponent.egcs_ar_legalname_en, egcs_fc_debtorname_fr: proponent.egcs_ar_legalname_fr,
    egcs_fc_cancomplete: editable && work, egcs_fc_canedit: repayment.egcs_fc_ledgerkind === 'pool' && editable && work, egcs_fc_canwork: work && repayment.egcs_fc_outcome === 'open',
    egcs_fc_cancancel: work && repayment.egcs_fc_outcome === 'open', egcs_fc_candelete: editable && Boolean(assignment)
      && status.egcs_cn_isdraft && context.contexts.every(owner => auth.userAbilities.authorize('account_receivable', 'delete', owner.scope)),
    egcs_fc_agencyname_en: agency.egcs_ay_name_en, egcs_fc_agencyname_fr: agency.egcs_ay_name_fr,
    egcs_fc_proponentreadable: await canAccessApplicantRecipient(auth, String(repayment.egcs_fc_applicantrecipient), 'read', db), egcs_fc_agreementreadable: false }
}
