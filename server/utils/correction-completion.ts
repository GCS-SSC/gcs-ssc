/* eslint-disable jsdoc/require-jsdoc -- Corrections use the established independent Completion adapter and protected Agreement transaction. */
import type { H3Event } from 'h3'
import type { Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { CompletionExecuteInput } from '~~/shared/types/schemas/completion'
import type { CompletionHookPayload } from '~~/shared/types/completion'
import { resolveCorrectionRuntimeContext } from './correction-context'
import { correctionError, validateCorrectionBasis, validateCorrectionPostingBasis } from './correction'
import { resolveCompletionRecord, resolveCompletionEvidenceId, emitCompletionHook } from './completion-runtime-core'
import { resolveBusinessStatusProtection, transitionBusinessStatus } from './business-status-runtime'
import { executeFreshReadSnapshot } from './fresh-read-snapshot'
import { executeFreshAuthorizedAgreementWrite } from './agreement-write-transaction'
import { cancelWorkflowRun, createCompletionTransition, resolveActiveWorkflowSetup } from './workflow-runtime'
import { recordCorrectionTerminalOutcome } from './correction-posting'
import { resolveReviewRuntimeEntityFromEntity } from './review-runtime-access'
import { authorize } from './authorize'
import { notFound } from './api-errors'

const resolveFreshCorrectionActor = async (trx: Transaction<Database>, authUserId: string) => {
  const actor = await trx.selectFrom('Common_User').innerJoin('user', 'user.id', 'Common_User.egcs_cn_auth_user_id')
    .select(['Common_User.id', 'Common_User.egcs_cn_name as name'])
    .where('user.id', '=', authUserId).where('user._deleted', '=', false).where('Common_User._deleted', '=', false)
    .executeTakeFirst()
  return actor ? { id: String(actor.id), name: actor.name } : null
}

export const getCorrectionCompletionRuntime = async (event: H3Event, id: string) => await executeFreshReadSnapshot(event, async trx => {
  const context = await resolveCorrectionRuntimeContext(trx, id)
  if (!context) return null
  const item = await resolveCompletionRecord(trx, 'fundingcasecorrection', id)
  const protection = await resolveBusinessStatusProtection(trx, 'fundingcasecorrection', id)
  const correction = await trx.selectFrom('Funding_Case_Agreement_Correction').select('egcs_fc_outcome')
    .where('id', '=', id).where('_deleted', '=', false).executeTakeFirstOrThrow()
  let blocker: string | null = !protection || protection.locked || correction.egcs_fc_outcome !== 'open' ? 'business_status' : null
  if (!item && !blocker) {
    try {
      await validateCorrectionPostingBasis(trx, id, { requireAdjustment: true })
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error)) throw error
      blocker = String(error.code)
    }
  }
  return { item, can_complete: item === null && blocker === null, blocker: item ? null : blocker }
})

export const executeCorrectionCompletion = async (event: H3Event, input: CompletionExecuteInput) => {
  const id = input.entityId
  const context = await resolveCorrectionRuntimeContext(event.context.$db, id)
  if (!context) return null
  const result = await executeFreshAuthorizedAgreementWrite(event, event.context.$db, context.agreementId, context, async (trx, _agreementContext, auth) => {
    const correction = await trx.selectFrom('Funding_Case_Agreement_Correction').selectAll()
      .where('id', '=', id).where('_deleted', '=', false).forUpdate().executeTakeFirstOrThrow()
    const protection = await resolveBusinessStatusProtection(trx, 'fundingcasecorrection', id)
    if (correction.egcs_fc_outcome !== 'open' || !protection || protection.locked
      || await resolveCompletionEvidenceId(trx, 'fundingcasecorrection', id)) {
      return await correctionError(event, 'CORRECTION_COMPLETION_LOCKED')
    }
    await trx.selectFrom('Funding_Case_Agreement_Correction_Line').select('id')
      .where('egcs_fc_correction', '=', id).where('_deleted', '=', false).orderBy('id').forUpdate().execute()
    await validateCorrectionBasis(event, trx, id, { requireAdjustment: true })
    const actor = await resolveFreshCorrectionActor(trx, auth.userId)
    if (!actor) return await notFound(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')
    const { completion } = await createCompletionTransition(event, trx, 'fundingcasecorrection', id,
      { comments: input.comments ?? '', initiatedBy: actor.id })
    const hookPayload = {
      completionId: completion.id, entityType: 'fundingcasecorrection', entityId: id,
      completedByUserId: actor.id, completedAt: completion.completedAt, comments: input.comments ?? '',
      context: { agreementId: context.agreementId, streamId: context.streamId, parentEntityType: 'fundingcaseagreement', parentEntityId: context.agreementId }
    } satisfies CompletionHookPayload
    return { hookPayload, actorName: actor.name }
  }, {
    assignmentTarget: { entityType: 'fundingcasecorrection', entityId: id },
    businessStatusTarget: { entityType: 'fundingcasecorrection', entityId: id }, businessStatusMode: 'engine', correctionId: id
  })
  const { hookPayload, actorName } = result
  await emitCompletionHook(hookPayload)
  return { item: { id: hookPayload.completionId, egcs_cn_comments: hookPayload.comments, egcs_cn_user: hookPayload.completedByUserId,
    egcs_cn_user_name: actorName, egcs_cn_completedat: hookPayload.completedAt, egcs_cn_disposition: 'workflow_started' as const }, can_complete: false }
}

export const cancelCorrection = async (event: H3Event, id: string, reason: string) => {
  const context = await resolveCorrectionRuntimeContext(event.context.$db, id)
  if (!context) return await notFound(event, 'CORRECTION_NOT_FOUND', 'apiErrors.correction.not_found')
  await authorize(event, 'correction', 'update', context.scope)
  if (!reason.trim()) return await correctionError(event, 'CORRECTION_CANCELLATION_REASON_REQUIRED')
  return await executeFreshAuthorizedAgreementWrite(event, event.context.$db, context.agreementId, context, async (trx, _agreementContext, auth) => {
    const correction = await trx.selectFrom('Funding_Case_Agreement_Correction').selectAll()
      .where('id', '=', id).where('_deleted', '=', false).forUpdate().executeTakeFirstOrThrow()
    if (correction.egcs_fc_outcome !== 'open') return await correctionError(event, 'CORRECTION_TERMINAL_IMMUTABLE')
    const actor = await resolveFreshCorrectionActor(trx, auth.userId)
    if (!actor) return await notFound(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')
    const active = await trx.selectFrom('Common_Runtime')
      .innerJoin('Common_Workflow_Run', 'Common_Workflow_Run.id', 'Common_Runtime.id')
      .selectAll('Common_Runtime').select('Common_Workflow_Run.egcs_cn_completion')
      .where('Common_Runtime.egcs_cn_kind', '=', 'workflow').where('Common_Runtime.egcs_cn_entitytype', '=', 'fundingcasecorrection')
      .where('Common_Runtime.egcs_cn_entityid', '=', id)
      .where('Common_Runtime.egcs_cn_state', 'in', ['pending', 'active', 'awaiting_action', 'paused'])
      .where('Common_Runtime._deleted', '=', false).forUpdate(['Common_Runtime', 'Common_Workflow_Run']).executeTakeFirst()
    if (active) {
      if (active.egcs_cn_purpose !== 'approval_submission' || !active.egcs_cn_completion) {
        return await correctionError(event, 'CORRECTION_WORKFLOW_ACTIVE')
      }
      await cancelWorkflowRun(trx, active, actor.id, { reason })
    } else {
      if (await resolveCompletionEvidenceId(trx, 'fundingcasecorrection', id)) {
        return await correctionError(event, 'CORRECTION_TERMINAL_IMMUTABLE')
      }
      const runtimeContext = await resolveReviewRuntimeEntityFromEntity(trx, 'fundingcasecorrection', id)
      const setup = runtimeContext ? await resolveActiveWorkflowSetup(trx, runtimeContext, 'approval_submission', true) : null
      if (!setup) return await correctionError(event, 'COMPLETION_WORKFLOW_REQUIRED')
      const transition = await transitionBusinessStatus(trx, 'fundingcasecorrection', id, setup.publicationDefinition.cancellationStatus)
      if (!transition.terminal) return await correctionError(event, 'CORRECTION_CANCELLATION_STATUS_REQUIRED')
      await recordCorrectionTerminalOutcome(trx, id, 'cancelled', { actorId: actor.id, reason })
    }
    return await trx.selectFrom('Funding_Case_Agreement_Correction').selectAll()
      .where('id', '=', id).where('_deleted', '=', false).executeTakeFirstOrThrow()
  }, { assignmentTarget: { entityType: 'fundingcasecorrection', entityId: id },
    businessStatusTarget: { entityType: 'fundingcasecorrection', entityId: id }, businessStatusMode: 'workflow', correctionId: id })
}
