/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns -- Posting runs only within the locked Completion-linked workflow transaction. */
import type { Kysely, Transaction } from 'kysely'
import type { Database, JsonValue } from '~~/shared/types/database'
import { parseMoney, moneyToCents } from '~~/shared/utils/money'
import { databaseMoneyValue } from './database-money'
import { hashPublicationDefinition } from './system-publication'
import { readCorrectionLines, validateCorrectionPostingBasis } from './correction'
import { assertAgreementCorrectionFinancialUnlocked } from './correction-lock'
import { resolveBusinessStatusProtection } from './business-status-runtime'
import { resolveCorrectionRuntimeContext } from './correction-context'
import { stageCorrectionOutcomeIntegrations } from './correction-notifications'

type DbClient = Kysely<Database> | Transaction<Database>
export type CorrectionPacket = {
  schemaVersion: 1
  correction: JsonValue
  lines: JsonValue
  sources: JsonValue
  attachments: JsonValue
  policy: { creatorApprovalAllowed: boolean }
  calculation: { formula: string, moneyScale: 2, capacity: string }
}
export type CorrectionTerminalOutcome = 'posted' | 'denied' | 'failed' | 'cancelled'

const retainJson = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value)) as JsonValue

export const captureCorrectionPacket = async (db: DbClient, correctionId: string): Promise<CorrectionPacket> => {
  const correction = await db.selectFrom('Funding_Case_Agreement_Correction').selectAll()
    .where('id', '=', correctionId).where('_deleted', '=', false).executeTakeFirstOrThrow()
  const context = await resolveCorrectionRuntimeContext(db, correctionId)
  if (!context) throw new Error('Correction packet owner is unavailable')
  const agency = await db.selectFrom('Agency_Profile').select('egcs_ay_correctioncreatorapproval')
    .where('id', '=', context.agencyId).where('_deleted', '=', false).executeTakeFirstOrThrow()
  const [lines, sources, attachments] = await Promise.all([
    readCorrectionLines(db, correctionId),
    db.selectFrom('Funding_Case_Agreement_Correction_Source').selectAll()
      .where('egcs_fc_correction', '=', correctionId).where('_deleted', '=', false).orderBy('id').execute(),
    db.selectFrom('Common_Attachment as attachment')
      .innerJoin('Common_Entity_Attachment as link', 'link.egcs_cn_attachment', 'attachment.id')
      .select(['attachment.id', 'attachment.egcs_cn_attachmenttype', 'attachment.egcs_cn_name_en', 'attachment.egcs_cn_name_fr',
        'attachment.egcs_cn_description_en', 'attachment.egcs_cn_description_fr', 'attachment.egcs_cn_filename',
        'attachment.egcs_cn_mimetype', 'attachment.egcs_cn_createdat', 'attachment.egcs_cn_filesize'])
      .where('link.egcs_cn_entitytype', '=', 'fundingcasecorrection').where('link.egcs_cn_entityid', '=', correctionId)
      .where('attachment._deleted', '=', false).where('link._deleted', '=', false).orderBy('attachment.id').execute()
  ])
  return {
    schemaVersion: 1, correction: retainJson(correction), lines: retainJson(lines), sources: retainJson(sources), attachments: retainJson(attachments),
    policy: { creatorApprovalAllowed: agency.egcs_ay_correctioncreatorapproval },
    calculation: {
      formula: 'original_paid + successful_jv_effect + prior_posted_corrections + adjustment',
      moneyScale: 2, capacity: 'agreement_agency_chart_of_account'
    }
  }
}

/** Resolves the exact Completion-linked submission, never an arbitrary Workflow or status. */
const lockCorrectionSubmission = async (trx: Transaction<Database>, correctionId: string, runtimeId: string) => {
  const run = await trx.selectFrom('Common_Runtime as runtime')
    .innerJoin('Common_Workflow_Run as run', 'run.id', 'runtime.id')
    .innerJoin('Common_Completion as completion', 'completion.id', 'run.egcs_cn_completion')
    .select(['runtime.id', 'run.egcs_cn_routing', 'completion.id as completionId'])
    .where('runtime.id', '=', runtimeId).where('runtime.egcs_cn_kind', '=', 'workflow')
    .where('runtime.egcs_cn_purpose', '=', 'approval_submission')
    .where('runtime.egcs_cn_entitytype', '=', 'fundingcasecorrection').where('runtime.egcs_cn_entityid', '=', correctionId)
    .where('completion.egcs_cn_entitytype', '=', 'fundingcasecorrection').where('completion.egcs_cn_entityid', '=', correctionId)
    .where('completion.egcs_cn_disposition', '=', 'workflow_started')
    .where('runtime._deleted', '=', false).where('completion._deleted', '=', false)
    .forUpdate(['runtime', 'run', 'completion']).executeTakeFirst()
  if (!run) throw new Error('Correction posting requires its Completion-linked approval submission')
  const latest = await trx.selectFrom('Common_Runtime as runtime')
    .innerJoin('Common_Workflow_Run as run', 'run.id', 'runtime.id')
    .select('runtime.id').where('run.egcs_cn_completion', '=', String(run.completionId))
    .where('runtime._deleted', '=', false).orderBy('runtime.egcs_cn_attempt', 'desc').executeTakeFirstOrThrow()
  if (String(latest.id) !== runtimeId) throw new Error('Correction submission has been superseded')
  return run
}

/** A pinned preparation Workflow must never leave an open Correction with a terminal business status. */
export const assertCorrectionWorkflowStatusTransition = async (
  trx: Transaction<Database>, correctionId: string, runtimeId: string, statusId: string
): Promise<void> => {
  const status = await trx.selectFrom('Common_Status').select('egcs_cn_terminal')
    .where('id', '=', statusId).where('_deleted', '=', false).forUpdate().executeTakeFirstOrThrow()
  if (status.egcs_cn_terminal) await lockCorrectionSubmission(trx, correctionId, runtimeId)
}

const recordOutcomeNotifications = async (
  trx: Transaction<Database>, correctionId: string, outcome: CorrectionTerminalOutcome, runtimeId: string | null
) => {
  const workers = await trx.selectFrom('Common_Entity_Assignment').select('egcs_cn_user')
    .where('egcs_cn_entitytype', '=', 'fundingcasecorrection').where('egcs_cn_entityid', '=', correctionId)
    .where('_deleted', '=', false).orderBy('egcs_cn_user').execute()
  if (!workers.length) throw new Error('Correction outcome requires its retained active roster')
  const notifications = await trx.insertInto('Funding_Case_Agreement_Correction_Notification').values(workers.map(worker => ({
    egcs_fc_correction: correctionId, egcs_fc_user: String(worker.egcs_cn_user),
    egcs_fc_outcome: outcome, egcs_fc_runtime: runtimeId
  }))).onConflict(conflict => conflict.columns(['egcs_fc_correction', 'egcs_fc_user']).doNothing())
    .returning(['id', 'egcs_fc_user']).execute()
  await stageCorrectionOutcomeIntegrations(trx, correctionId, notifications.map(notification => ({
    notificationId: String(notification.id), commonUserId: String(notification.egcs_fc_user)
  })), runtimeId)
}

export const recordCorrectionTerminalOutcome = async (
  trx: Transaction<Database>, correctionId: string, outcome: Exclude<CorrectionTerminalOutcome, 'posted'>,
  options: { runtimeId?: string, actorId?: string, reason?: string }
): Promise<void> => {
  const correction = await trx.selectFrom('Funding_Case_Agreement_Correction').selectAll()
    .where('id', '=', correctionId).where('_deleted', '=', false).forUpdate().executeTakeFirstOrThrow()
  if (correction.egcs_fc_outcome !== 'open') {
    if (correction.egcs_fc_outcome !== outcome) throw new Error('Terminal Correction outcome is immutable')
    return
  }
  if (!options.actorId && !(outcome === 'failed' && options.runtimeId && options.reason?.trim())) {
    throw new Error('Correction terminal outcome requires actor attribution or an explicit recorded execution failure')
  }
  if (options.runtimeId) await lockCorrectionSubmission(trx, correctionId, options.runtimeId)
  const status = await resolveBusinessStatusProtection(trx, 'fundingcasecorrection', correctionId)
  if (!status?.terminal) throw new Error('Correction terminal outcome requires a terminal Agency status')
  const adjustment = await trx.selectFrom('Funding_Case_Agreement_Correction_Adjustment').select('id')
    .where('egcs_fc_correction', '=', correctionId).executeTakeFirst()
  if (adjustment) throw new Error('A rejected or cancelled Correction cannot have posted adjustments')
  await trx.updateTable('Funding_Case_Agreement_Correction').set({
    egcs_fc_outcome: outcome, egcs_fc_terminalby: options.actorId ?? null,
    egcs_fc_terminalat: new Date(), egcs_fc_terminalreason: options.reason ?? null
  }).where('id', '=', correctionId).where('egcs_fc_outcome', '=', 'open').executeTakeFirstOrThrow()
  await recordOutcomeNotifications(trx, correctionId, outcome, options.runtimeId ?? null)
}

export const postCorrection = async (
  trx: Transaction<Database>, correctionId: string, runtimeId: string, actorId?: string
): Promise<void> => {
  if (!actorId) throw new Error('Correction posting requires final approver attribution')
  const correction = await trx.selectFrom('Funding_Case_Agreement_Correction').selectAll()
    .where('id', '=', correctionId).where('_deleted', '=', false).forUpdate().executeTakeFirstOrThrow()
  const run = await lockCorrectionSubmission(trx, correctionId, runtimeId)
  if (correction.egcs_fc_outcome === 'posted' && String(correction.egcs_fc_postingruntime) === runtimeId) return
  if (correction.egcs_fc_outcome !== 'open') throw new Error('A terminal Correction cannot post')
  await assertAgreementCorrectionFinancialUnlocked(trx, String(correction.egcs_fc_fundingagreement), { correctionId })
  const status = await resolveBusinessStatusProtection(trx, 'fundingcasecorrection', correctionId)
  if (!status?.terminal) throw new Error('Correction posting requires terminal approval success')
  const evidence = run.egcs_cn_routing as { correctionPacket?: CorrectionPacket, correctionPacketHash?: string } | null
  if (!evidence?.correctionPacket || !evidence.correctionPacketHash
    || hashPublicationDefinition(evidence.correctionPacket as unknown as JsonValue) !== evidence.correctionPacketHash) {
    throw new Error('Correction immutable submission packet failed its integrity check')
  }
  const approvalRows = await trx.selectFrom('Common_Approval as approval')
    .innerJoin('Common_Runtime_Item as item', 'item.id', 'approval.egcs_cn_runtimeitem')
    .select(['approval.egcs_cn_approvalvalue', 'item.egcs_cn_state'])
    .where('item.egcs_cn_runtime', '=', runtimeId).where('item._deleted', '=', false).execute()
  const requiredItems = await trx.selectFrom('Common_Runtime_Item').select('egcs_cn_state')
    .where('egcs_cn_runtime', '=', runtimeId).where('egcs_cn_parentruntimeitem', 'is', null)
    .where('_deleted', '=', false).execute()
  if (!approvalRows.length || approvalRows.some(row => row.egcs_cn_approvalvalue !== true || row.egcs_cn_state !== 'approved')
    || !requiredItems.length || requiredItems.some(row => !['succeeded', 'approved'].includes(row.egcs_cn_state))) {
    throw new Error('Correction posting requires every selected approval and workflow stage to succeed')
  }
  await validateCorrectionPostingBasis(trx, correctionId, { requireAdjustment: true })
  const lines = await readCorrectionLines(trx, correctionId)
  if (hashPublicationDefinition(retainJson(lines)) !== hashPublicationDefinition(evidence.correctionPacket.lines)) {
    throw new Error('Correction lines differ from immutable submission evidence')
  }
  const adjustments = lines.filter(line => moneyToCents(parseMoney(line.egcs_fc_adjustment)) !== BigInt(0))
  await trx.insertInto('Funding_Case_Agreement_Correction_Adjustment').values(adjustments.map(line => ({
    egcs_fc_correction: correctionId, egcs_fc_fundingagreement: String(correction.egcs_fc_fundingagreement),
    egcs_fc_correctionline: String(line.id), egcs_fc_commitmentline: String(line.egcs_fc_commitmentline),
    egcs_fc_chartofaccount: String(line.egcs_fc_chartofaccount), egcs_fc_agencyfiscalyear: String(line.egcs_fc_agencyfiscalyear),
    egcs_fc_amount: databaseMoneyValue(line.egcs_fc_adjustment)
  }))).execute()
  await trx.updateTable('Funding_Case_Agreement_Correction').set({
    egcs_fc_outcome: 'posted', egcs_fc_postedat: new Date(), egcs_fc_postingruntime: runtimeId,
    egcs_fc_terminalby: actorId ?? null, egcs_fc_terminalat: new Date(), egcs_fc_terminalreason: null
  }).where('id', '=', correctionId).where('egcs_fc_outcome', '=', 'open').executeTakeFirstOrThrow()
  await recordOutcomeNotifications(trx, correctionId, 'posted', runtimeId)
}
