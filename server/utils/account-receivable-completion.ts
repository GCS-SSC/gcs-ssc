/* eslint-disable jsdoc/require-jsdoc -- Completion owns published approval submission for AR and received repayments. */
import type { H3Event } from 'h3'
import type { CompletionExecuteInput } from '~~/shared/types/schemas/completion'
import type { CompletionHookPayload } from '~~/shared/types/completion'
import { validateAccountReceivableCreditMemoLines } from './account-receivable-credit-memo-lines'
import { accountReceivableError } from './account-receivable-source'
import { authorizeAccountReceivable, assertAccountReceivableEditable, validateAccountReceivableBasis } from './account-receivable'
import { authorizeAccountReceivableCreditMemo, assertAccountReceivableCreditMemoEditable } from './account-receivable-credit-memo'
import { executeFreshAccountReceivableWrite, type AccountReceivableCaseType } from './account-receivable-context'
import { resolveCompletionRecord, resolveCompletionEvidenceId, emitCompletionHook } from './completion-runtime-core'
import { resolveBusinessStatusProtection } from './business-status-runtime'
import { resolveReviewRuntimeEntityFromEntity } from './review-runtime-access'
import { createCompletionTransition, resolveActiveWorkflowSetup } from './workflow-runtime'
import { resolveAssignmentCommonUserId } from './entity-assignment'
import { forbidden } from './api-errors'

const getCompletion = async (event: H3Event, id: string, entityType: AccountReceivableCaseType) => {
  if (entityType !== 'fundingcaseaccountreceivablecreditmemo') await authorizeAccountReceivable(event, id)
  else await authorizeAccountReceivableCreditMemo(event, id)
  const db = event.context.$db
  const item = await resolveCompletionRecord(db, entityType, id)
  const protection = await resolveBusinessStatusProtection(db, entityType, id)
  return { item, can_complete: !item && Boolean(protection && !protection.locked), blocker: item ? null : !protection || protection.locked ? 'business_status' : null }
}

export const getAccountReceivableCompletion = async (event: H3Event, id: string) => {
  const context = await authorizeAccountReceivable(event, id)
  return await getCompletion(event, id, context.entityType)
}
export const getAccountReceivableCreditMemoCompletion = async (event: H3Event, id: string) => await getCompletion(event, id, 'fundingcaseaccountreceivablecreditmemo')

const executeCompletion = async (event: H3Event, input: CompletionExecuteInput, entityType: AccountReceivableCaseType) => {
  const id = input.entityId
  const context = entityType !== 'fundingcaseaccountreceivablecreditmemo' ? await authorizeAccountReceivable(event, id, 'update') : await authorizeAccountReceivableCreditMemo(event, id, 'update')
  const agreementIds = 'agreementIds' in context ? context.agreementIds : [context.agreementId]
  const result = await executeFreshAccountReceivableWrite(event, { ...context, agreementIds }, async (trx, auth) => {
    if (await resolveCompletionEvidenceId(trx, entityType, id)) return await accountReceivableError(event, 'AR_COMPLETION_LOCKED')
    if (entityType !== 'fundingcaseaccountreceivablecreditmemo') {
      await assertAccountReceivableEditable(event, trx, id)
      try {
        await validateAccountReceivableBasis(trx, id, { submission: true })
      } catch (error) {
        return await accountReceivableError(event, error instanceof Error ? error.message : 'AR_INVALID_BASIS')
      }
    } else {
      await assertAccountReceivableCreditMemoEditable(event, trx, id)
      try {
        await validateAccountReceivableCreditMemoLines(trx, id)
      } catch (error) {
        return await accountReceivableError(event, error instanceof Error ? error.message : 'AR_ACCOUNT_UNAVAILABLE')
      }
    }
    const runtimeContext = await resolveReviewRuntimeEntityFromEntity(trx, entityType, id)
    if (!runtimeContext || !await resolveActiveWorkflowSetup(trx, runtimeContext, 'approval_submission', true)) return await accountReceivableError(event, 'COMPLETION_WORKFLOW_REQUIRED')
    const actorId = await resolveAssignmentCommonUserId(trx, auth.userId)
    if (!actorId) return await forbidden(event)
    const actor = await trx.selectFrom('Common_User').select('egcs_cn_name').where('id', '=', actorId).executeTakeFirstOrThrow()
    const { completion } = await createCompletionTransition(event, trx, entityType, id, { comments: input.comments ?? '', initiatedBy: actorId })
    const hookPayload = { completionId: completion.id, entityType, entityId: id, completedByUserId: actorId, completedAt: completion.completedAt,
      comments: input.comments ?? '', context: { agreementId: context.agreementId, streamId: context.streamId,
        parentEntityType: context.agreementId ? 'fundingcaseagreement' : 'applicantrecipient', parentEntityId: context.agreementId ?? context.applicantRecipientId } } satisfies CompletionHookPayload
    return { hookPayload, actorName: actor.egcs_cn_name }
  }, { target: { entityType, entityId: id } })
  await emitCompletionHook(result.hookPayload)
  return { item: { id: result.hookPayload.completionId, egcs_cn_comments: result.hookPayload.comments, egcs_cn_user: result.hookPayload.completedByUserId,
    egcs_cn_user_name: result.actorName, egcs_cn_completedat: result.hookPayload.completedAt, egcs_cn_disposition: 'workflow_started' as const }, can_complete: false }
}

export const executeAccountReceivableCompletion = async (event: H3Event, input: CompletionExecuteInput) => {
  const context = await authorizeAccountReceivable(event, input.entityId, 'update')
  if (context.entityType !== input.entityType) return await forbidden(event)
  return await executeCompletion(event, input, context.entityType)
}
export const executeAccountReceivableCreditMemoCompletion = async (event: H3Event, input: CompletionExecuteInput) => await executeCompletion(event, input, 'fundingcaseaccountreceivablecreditmemo')
