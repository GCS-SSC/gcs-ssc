/* eslint-disable jsdoc/require-jsdoc -- Completion follows the shared Payment adapter. */
import type { H3Event } from 'h3'
import type { CompletionExecuteInput } from '~~/shared/types/schemas/completion'
import type { CompletionHookPayload } from '~~/shared/types/completion'
import { generateJournalVoucherAdjustments, JournalVoucherAccountingError } from '~~/shared/utils/journal-voucher'
import { resolveJournalVoucherRuntimeContext } from './journal-voucher-context'
import { readJournalVoucherLines, journalVoucherError } from './journal-voucher'
import { resolveCompletionRecord, resolveCompletionEvidenceId, emitCompletionHook } from './completion-runtime-core'
import { resolveBusinessStatusProtection } from './business-status-runtime'
import { executeFreshReadSnapshot } from './fresh-read-snapshot'
import { executeFreshAuthorizedAgreementWrite } from './agreement-write-transaction'
import { resolveCurrentCommonUser } from './additional-reviewer-runtime'
import { createCompletionTransition } from './workflow-runtime'
import { notFound } from './api-errors'

const validateAccounting = async (db: H3Event['context']['$db'], id: string) => {
  const lines = await readJournalVoucherLines(db, id)
  const generated = generateJournalVoucherAdjustments(lines.filter(line => line.egcs_fc_kind === 'original'),
    lines.filter(line => line.egcs_fc_kind === 'corrected'), { requireAdjustment: true })
  const saved = lines.filter(line => line.egcs_fc_kind === 'adjustment')
  const projection = (rows: typeof generated) => JSON.stringify(rows.map(row => [row.egcs_fc_commitmentline,
    row.egcs_fc_chartofaccount, row.egcs_fc_accountingdimensions, row.egcs_fc_amount]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))))
  if (projection(generated) !== projection(saved)) throw new JournalVoucherAccountingError('JV_UNBALANCED')
}

export const getJournalVoucherCompletionRuntime = async (event: H3Event, id: string) => await executeFreshReadSnapshot(event, async trx => {
  const context = await resolveJournalVoucherRuntimeContext(trx, id)
  if (!context) return null
  const item = await resolveCompletionRecord(trx, 'fundingcasejournalvoucher', id)
  const protection = await resolveBusinessStatusProtection(trx, 'fundingcasejournalvoucher', id)
  let blocker: string | null = protection?.locked ? 'business_status' : null
  try {
    await validateAccounting(trx, id)
  } catch (error) {
    if (!(error instanceof JournalVoucherAccountingError)) throw error
    blocker = error.code
  }
  return { item, can_complete: item === null && blocker === null, blocker: item ? null : blocker }
})

export const executeJournalVoucherCompletion = async (event: H3Event, input: CompletionExecuteInput) => {
  const id = input.entityId
  const context = await resolveJournalVoucherRuntimeContext(event.context.$db, id)
  if (!context) return null
  const user = await resolveCurrentCommonUser(event)
  if (!user) return await notFound(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')
  const payload = await executeFreshAuthorizedAgreementWrite(event, event.context.$db, context.agreementId, context, async trx => {
    const protection = await resolveBusinessStatusProtection(trx, 'fundingcasejournalvoucher', id)
    if (!protection || protection.locked || await resolveCompletionEvidenceId(trx, 'fundingcasejournalvoucher', id)) return await journalVoucherError(event, 'JV_COMPLETION_LOCKED')
    await trx.selectFrom('Funding_Case_Agreement_Journal_Voucher_Line').select('id').where('egcs_fc_journalvoucher', '=', id).where('_deleted', '=', false).orderBy('id').forUpdate().execute()
    try {
      await validateAccounting(trx, id)
    } catch (error) {
      if (!(error instanceof JournalVoucherAccountingError)) throw error
      return await journalVoucherError(event, error.code)
    }
    const { completion } = await createCompletionTransition(event, trx, 'fundingcasejournalvoucher', id,
      { comments: input.comments ?? '', initiatedBy: user.id })
    return {
      completionId: completion.id, entityType: 'fundingcasejournalvoucher', entityId: id,
      completedByUserId: user.id, completedAt: completion.completedAt, comments: input.comments ?? '',
      context: { agreementId: context.agreementId, streamId: context.streamId, parentEntityType: 'fundingcaseagreement', parentEntityId: context.agreementId }
    } satisfies CompletionHookPayload
  }, { assignmentTarget: { entityType: 'fundingcasejournalvoucher', entityId: id },
    businessStatusTarget: { entityType: 'fundingcasejournalvoucher', entityId: id }, businessStatusMode: 'engine' })
  await emitCompletionHook(payload)
  return { item: { id: payload.completionId, egcs_cn_comments: payload.comments, egcs_cn_user: user.id,
    egcs_cn_user_name: user.name, egcs_cn_completedat: payload.completedAt }, can_complete: false }
}
