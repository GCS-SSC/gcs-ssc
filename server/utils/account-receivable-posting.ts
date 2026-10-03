/* eslint-disable jsdoc/require-jsdoc -- Immutable, latest Completion-linked terminal postings. */
import type { Kysely, Transaction } from 'kysely'
import { sql } from 'kysely'
import type { Database, JsonValue } from '~~/shared/types/database'
import { hashPublicationDefinition } from './system-publication'
import { readAccountReceivableLines, readAccountReceivableCoding, validateAccountReceivableBasis } from './account-receivable'
import { readAccountReceivableRecoveryAllocations, postAccountReceivableRecovery, validateAccountReceivableRecovery } from './account-receivable-recovery'
import { assertAgreementCorrectionFinancialUnlocked } from './correction-lock'
import { resolveBusinessStatusProtection } from './business-status-runtime'
import type { AccountReceivableCaseType } from './account-receivable-context'
import { databaseMoneyText, parseDatabaseMoney } from './database-money'

export type AccountReceivableTerminalOutcome = 'posted' | 'denied' | 'failed' | 'cancelled'
const json = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value)) as JsonValue

const retainedAttachments = async (db: Kysely<Database>, entityType: AccountReceivableCaseType, id: string) => await db.selectFrom('Common_Attachment as attachment')
  .innerJoin('Common_Entity_Attachment as link', 'link.egcs_cn_attachment', 'attachment.id')
  .select(['attachment.id', 'attachment.egcs_cn_attachmenttype', 'attachment.egcs_cn_name_en', 'attachment.egcs_cn_name_fr',
    'attachment.egcs_cn_description_en', 'attachment.egcs_cn_description_fr', 'attachment.egcs_cn_filename', 'attachment.egcs_cn_mimetype', 'attachment.egcs_cn_createdat', 'attachment.egcs_cn_filesize'])
  .where('link.egcs_cn_entitytype', '=', entityType).where('link.egcs_cn_entityid', '=', id).where('attachment._deleted', '=', false).where('link._deleted', '=', false).orderBy('attachment.id').execute()

export const captureAccountReceivablePacket = async (db: Kysely<Database>, id: string) => {
  await validateAccountReceivableBasis(db, id, { submission: true })
  const lines = await readAccountReceivableLines(db, id)
  const labels = (lines[0]?.egcs_fc_evidence ?? {}) as Record<string, JsonValue>
  const header = await db.selectFrom('Funding_Case_Agreement_Account_Receivable').selectAll()
    .select(sql<string | null>`egcs_fc_fiscaloutstanding::text`.as('egcs_fc_fiscaloutstanding')).where('id', '=', id).where('_deleted', '=', false).executeTakeFirstOrThrow()
  return { schemaVersion: 1 as const,
    accountReceivable: json({ ...header, egcs_fc_fiscaloutstanding: header.egcs_fc_fiscaloutstanding === null ? null : parseDatabaseMoney(header.egcs_fc_fiscaloutstanding),
      egcs_fc_debtorname_en: labels.egcs_fc_debtorname_en ?? '', egcs_fc_debtorname_fr: labels.egcs_fc_debtorname_fr ?? '', egcs_fc_fiscalyeardisplay: labels.egcs_fc_fiscalyeardisplay ?? '' }),
    lines: json(lines), coding: json(await readAccountReceivableCoding(db, id)),
    attachments: json(await retainedAttachments(db, 'fundingcaseaccountreceivable', id)), policy: { creatorApprovalAllowed: false },
    calculation: { moneyScale: 2, formula: 'established_principal_plus_approved_deltas_minus_successful_principal_recoveries' }
  }
}

export const captureAccountReceivableCreditMemoPacket = async (db: Kysely<Database>, id: string) => {
  const repayment = await db.selectFrom('Funding_Case_Account_Receivable_Credit_Memo').selectAll()
    .select(databaseMoneyText(sql.ref('egcs_fc_amount')).as('egcs_fc_amount')).where('id', '=', id).where('_deleted', '=', false).executeTakeFirstOrThrow()
  const recovery = await db.selectFrom('Funding_Case_Account_Receivable_Recovery').selectAll().where('egcs_fc_creditmemo', '=', id).where('egcs_fc_outcome', '=', 'open').where('_deleted', '=', false).executeTakeFirstOrThrow()
  const allocations = await readAccountReceivableRecoveryAllocations(db, String(recovery.id))
  const source = allocations[0] ? await db.selectFrom('Funding_Case_Agreement_Account_Receivable_Line').select('egcs_fc_evidence').where('id', '=', String(allocations[0].egcs_fc_receivableline)).executeTakeFirst() : null
  const labels = (source?.egcs_fc_evidence ?? {}) as Record<string, JsonValue>
  return { schemaVersion: 1 as const, accountReceivableCreditMemo: json({ ...repayment, egcs_fc_amount: parseDatabaseMoney(repayment.egcs_fc_amount),
    egcs_fc_debtorname_en: labels.egcs_fc_debtorname_en ?? '', egcs_fc_debtorname_fr: labels.egcs_fc_debtorname_fr ?? '' }), recoveryId: String(recovery.id),
  allocations: json(allocations),
  attachments: json(await retainedAttachments(db, 'fundingcaseaccountreceivablecreditmemo', id)), policy: { creatorApprovalAllowed: false } }
}

export const lockAccountReceivableSubmission = async (trx: Transaction<Database>, entityType: AccountReceivableCaseType, id: string, runtimeId: string) => {
  const run = await trx.selectFrom('Common_Runtime as runtime').innerJoin('Common_Workflow_Run as run', 'run.id', 'runtime.id')
    .innerJoin('Common_Completion as completion', 'completion.id', 'run.egcs_cn_completion')
    .select(['runtime.id', 'runtime.egcs_cn_state', 'run.egcs_cn_routing', 'completion.id as completionId'])
    .where('runtime.id', '=', runtimeId).where('runtime.egcs_cn_kind', '=', 'workflow').where('runtime.egcs_cn_purpose', '=', 'approval_submission')
    .where('runtime.egcs_cn_entitytype', '=', entityType).where('runtime.egcs_cn_entityid', '=', id)
    .where('completion.egcs_cn_entitytype', '=', entityType).where('completion.egcs_cn_entityid', '=', id)
    .where('completion.egcs_cn_disposition', '=', 'workflow_started').where('runtime._deleted', '=', false).where('completion._deleted', '=', false)
    .forUpdate(['runtime', 'run', 'completion']).executeTakeFirst()
  if (!run) throw new Error('AR_COMPLETION_WORKFLOW_REQUIRED')
  const latest = await trx.selectFrom('Common_Runtime as runtime').innerJoin('Common_Workflow_Run as run', 'run.id', 'runtime.id')
    .select('runtime.id').where('run.egcs_cn_completion', '=', String(run.completionId)).where('runtime._deleted', '=', false)
    .orderBy('runtime.egcs_cn_attempt', 'desc').orderBy('runtime.id', 'desc').executeTakeFirstOrThrow()
  if (String(latest.id) !== runtimeId) throw new Error('AR_WORKFLOW_SUPERSEDED')
  return run
}

const assertSuccessfulSubmission = async (trx: Transaction<Database>, entityType: AccountReceivableCaseType, id: string, runtimeId: string, creatorId: string, actorId?: string) => {
  if (!actorId) throw new Error('AR_APPROVER_REQUIRED')
  if (actorId === creatorId) throw new Error('AR_CREATOR_APPROVAL_FORBIDDEN')
  const run = await lockAccountReceivableSubmission(trx, entityType, id, runtimeId)
  const status = await resolveBusinessStatusProtection(trx, entityType, id)
  if (!status?.terminal) throw new Error('AR_TERMINAL_STATUS_REQUIRED')
  const approvals = await trx.selectFrom('Common_Approval as approval').innerJoin('Common_Runtime_Item as item', 'item.id', 'approval.egcs_cn_runtimeitem')
    .select(['approval.egcs_cn_approvalvalue', 'item.egcs_cn_state']).where('item.egcs_cn_runtime', '=', runtimeId).where('item._deleted', '=', false).execute()
  const stages = await trx.selectFrom('Common_Runtime_Item').select('egcs_cn_state').where('egcs_cn_runtime', '=', runtimeId)
    .where('egcs_cn_parentruntimeitem', 'is', null).where('_deleted', '=', false).execute()
  if (!approvals.length || approvals.some(row => row.egcs_cn_approvalvalue !== true || row.egcs_cn_state !== 'approved')
    || !stages.length || stages.some(row => !['succeeded', 'approved'].includes(row.egcs_cn_state))) throw new Error('AR_FINAL_APPROVAL_REQUIRED')
  return run
}

export const postAccountReceivable = async (trx: Transaction<Database>, id: string, runtimeId: string, actorId?: string) => {
  const debt = await trx.selectFrom('Funding_Case_Agreement_Account_Receivable').selectAll().where('id', '=', id).where('_deleted', '=', false).forUpdate().executeTakeFirstOrThrow()
  if (debt.egcs_fc_outcome === 'posted' && String(debt.egcs_fc_postingruntime) === runtimeId) return
  if (debt.egcs_fc_outcome !== 'open') throw new Error('AR_TERMINAL_IMMUTABLE')
  const run = await assertSuccessfulSubmission(trx, 'fundingcaseaccountreceivable', id, runtimeId, String(debt.egcs_fc_createdby), actorId)
  const routing = run.egcs_cn_routing as { accountReceivablePacket?: Awaited<ReturnType<typeof captureAccountReceivablePacket>>; accountReceivablePacketHash?: string } | null
  if (!routing?.accountReceivablePacket || !routing.accountReceivablePacketHash
    || hashPublicationDefinition(json(routing.accountReceivablePacket)) !== routing.accountReceivablePacketHash) throw new Error('AR_PACKET_INTEGRITY')
  await assertAgreementCorrectionFinancialUnlocked(trx, String(debt.egcs_fc_fundingagreement))
  const basis = await validateAccountReceivableBasis(trx, id, { submission: true })
  if (hashPublicationDefinition(json(basis.lines)) !== hashPublicationDefinition(routing.accountReceivablePacket.lines)
    || hashPublicationDefinition(json(basis.coding)) !== hashPublicationDefinition(routing.accountReceivablePacket.coding)) throw new Error('AR_PACKET_BASIS_CHANGED')
  await trx.updateTable('Funding_Case_Agreement_Account_Receivable').set({ egcs_fc_outcome: 'posted', egcs_fc_postedat: new Date(),
    egcs_fc_postingruntime: runtimeId, egcs_fc_terminalby: actorId!, egcs_fc_terminalat: new Date(), egcs_fc_terminalreason: null }).where('id', '=', id).where('egcs_fc_outcome', '=', 'open').execute()
}

export const postAccountReceivableCreditMemo = async (trx: Transaction<Database>, id: string, runtimeId: string, actorId?: string) => {
  const repayment = await trx.selectFrom('Funding_Case_Account_Receivable_Credit_Memo').selectAll().where('id', '=', id).where('_deleted', '=', false).forUpdate().executeTakeFirstOrThrow()
  if (repayment.egcs_fc_outcome === 'posted' && String(repayment.egcs_fc_postingruntime) === runtimeId) return
  if (repayment.egcs_fc_outcome !== 'open') throw new Error('AR_REPAYMENT_TERMINAL_IMMUTABLE')
  const run = await assertSuccessfulSubmission(trx, 'fundingcaseaccountreceivablecreditmemo', id, runtimeId, String(repayment.egcs_fc_createdby), actorId)
  const routing = run.egcs_cn_routing as { accountReceivableCreditMemoPacket?: Awaited<ReturnType<typeof captureAccountReceivableCreditMemoPacket>>; accountReceivableCreditMemoPacketHash?: string } | null
  if (!routing?.accountReceivableCreditMemoPacket || !routing.accountReceivableCreditMemoPacketHash
    || hashPublicationDefinition(json(routing.accountReceivableCreditMemoPacket)) !== routing.accountReceivableCreditMemoPacketHash) throw new Error('AR_PACKET_INTEGRITY')
  const current = await captureAccountReceivableCreditMemoPacket(trx, id)
  if (hashPublicationDefinition(current.allocations) !== hashPublicationDefinition(routing.accountReceivableCreditMemoPacket.allocations)) throw new Error('AR_PACKET_BASIS_CHANGED')
  const validated = await validateAccountReceivableRecovery(trx, current.recoveryId)
  for (const agreementId of new Set(validated.allocations.map(row => String(row.egcs_fc_fundingagreement)))) await assertAgreementCorrectionFinancialUnlocked(trx, agreementId)
  await postAccountReceivableRecovery(trx, current.recoveryId, runtimeId)
  await trx.updateTable('Funding_Case_Account_Receivable_Credit_Memo').set({ egcs_fc_outcome: 'posted', egcs_fc_postedat: new Date(),
    egcs_fc_postingruntime: runtimeId, egcs_fc_terminalby: actorId!, egcs_fc_terminalat: new Date(), egcs_fc_terminalreason: null }).where('id', '=', id).where('egcs_fc_outcome', '=', 'open').execute()
}

export const recordAccountReceivableTerminalOutcome = async (trx: Transaction<Database>, id: string, outcome: Exclude<AccountReceivableTerminalOutcome, 'posted'>, options: { runtimeId?: string; actorId?: string; reason?: string }) => {
  const row = await trx.selectFrom('Funding_Case_Agreement_Account_Receivable').selectAll().where('id', '=', id).where('_deleted', '=', false).forUpdate().executeTakeFirstOrThrow()
  if (row.egcs_fc_outcome !== 'open') {
    if (row.egcs_fc_outcome !== outcome) throw new Error('AR_TERMINAL_IMMUTABLE')
    return
  }
  if (!options.actorId && !(outcome === 'failed' && options.runtimeId && options.reason?.trim())) throw new Error('AR_TERMINAL_ACTOR_REQUIRED')
  if (options.runtimeId) await lockAccountReceivableSubmission(trx, 'fundingcaseaccountreceivable', id, options.runtimeId)
  if (!(await resolveBusinessStatusProtection(trx, 'fundingcaseaccountreceivable', id))?.terminal) throw new Error('AR_TERMINAL_STATUS_REQUIRED')
  await trx.updateTable('Funding_Case_Agreement_Account_Receivable').set({ egcs_fc_outcome: outcome, egcs_fc_terminalby: options.actorId ?? null,
    egcs_fc_terminalat: new Date(), egcs_fc_terminalreason: options.reason ?? null }).where('id', '=', id).execute()
}

export const recordAccountReceivableCreditMemoTerminalOutcome = async (trx: Transaction<Database>, id: string, outcome: Exclude<AccountReceivableTerminalOutcome, 'posted'>, options: { runtimeId?: string; actorId?: string; reason?: string }) => {
  const row = await trx.selectFrom('Funding_Case_Account_Receivable_Credit_Memo').selectAll().where('id', '=', id).where('_deleted', '=', false).forUpdate().executeTakeFirstOrThrow()
  if (row.egcs_fc_outcome !== 'open') {
    if (row.egcs_fc_outcome !== outcome) throw new Error('AR_TERMINAL_IMMUTABLE')
    return
  }
  if (!options.actorId && !(outcome === 'failed' && options.runtimeId && options.reason?.trim())) throw new Error('AR_TERMINAL_ACTOR_REQUIRED')
  if (options.runtimeId) await lockAccountReceivableSubmission(trx, 'fundingcaseaccountreceivablecreditmemo', id, options.runtimeId)
  if (!(await resolveBusinessStatusProtection(trx, 'fundingcaseaccountreceivablecreditmemo', id))?.terminal) throw new Error('AR_TERMINAL_STATUS_REQUIRED')
  await trx.updateTable('Funding_Case_Account_Receivable_Recovery').set({ egcs_fc_outcome: 'released', egcs_fc_releasedat: new Date() }).where('egcs_fc_creditmemo', '=', id).where('egcs_fc_outcome', '=', 'open').execute()
  await trx.updateTable('Funding_Case_Account_Receivable_Credit_Memo').set({ egcs_fc_outcome: outcome, egcs_fc_terminalby: options.actorId ?? null,
    egcs_fc_terminalat: new Date(), egcs_fc_terminalreason: options.reason ?? null }).where('id', '=', id).execute()
}

export const assertAccountReceivableWorkflowStatusTransition = async (trx: Transaction<Database>, entityType: AccountReceivableCaseType, id: string, runtimeId: string, statusId: string) => {
  const status = await trx.selectFrom('Common_Status').select('egcs_cn_terminal').where('id', '=', statusId).where('_deleted', '=', false).executeTakeFirstOrThrow()
  if (status.egcs_cn_terminal) await lockAccountReceivableSubmission(trx, entityType, id, runtimeId)
}
