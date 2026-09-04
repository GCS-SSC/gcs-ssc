/* eslint-disable jsdoc/require-jsdoc -- Required-workflow Completion adapters share one host-owned transaction path. */
import type { H3Event } from 'h3'
import { resolveCurrentCommonUser } from './additional-reviewer-runtime'
import { resolveAgreementScopeContext } from './agreement'
import { resolveAgreementAmendmentRuntimeContext } from './agreement-amendment'
import { resolveAgreementCloseoutRuntimeContext } from './agreement-closeout'
import { executeFreshAuthorizedAgreementWrite } from './agreement-write-transaction'
import { badRequest, notFound } from './api-errors'
import { authorizeFreshAssignedItem } from './authorize'
import { resolveBusinessStatusProtection } from './business-status-runtime'
import { executeFreshReadSnapshot } from './fresh-read-snapshot'
import { emitCompletionHook, resolveCompletionEvidenceId, resolveCompletionRecord } from './completion-runtime-core'
import { createCompletionTransition } from './workflow-runtime'
import type { CompletionHookPayload } from '~~/shared/types/completion'
import type { Database, Entity_Type } from '~~/shared/types/database'
import type { Kysely, Transaction } from 'kysely'
import type { CompletionExecuteInput } from '~~/shared/types/schemas/completion'

type RequiredWorkflowEntityType = Extract<Entity_Type, 'fundingcaseamendment' | 'fundingcaseagreementcloseout'>

const resolveContext = async (db: Kysely<Database> | Transaction<Database>, entityType: RequiredWorkflowEntityType, entityId: string) =>
  entityType === 'fundingcaseamendment'
    ? await resolveAgreementAmendmentRuntimeContext(db, entityId)
    : await resolveAgreementCloseoutRuntimeContext(db, entityId)

export const getRequiredWorkflowCompletionRuntime = async (
  event: H3Event,
  entityType: RequiredWorkflowEntityType,
  entityId: string
) => {
  return await executeFreshReadSnapshot(event, async trx => {
    const context = await resolveContext(trx, entityType, entityId)
    if (!context) return null
    const item = await resolveCompletionRecord(trx, entityType, entityId)
    const protection = await resolveBusinessStatusProtection(trx, entityType, entityId)
    return {
      item,
      can_complete: item === null && Boolean(protection && !protection.locked),
      blocker: item ? null : !protection || protection.locked ? 'business_status' as const : null
    }
  })
}

export const executeRequiredWorkflowCompletion = async (
  event: H3Event,
  input: CompletionExecuteInput
) => {
  if (input.entityType !== 'fundingcaseamendment' && input.entityType !== 'fundingcaseagreementcloseout') return null
  const entityType: RequiredWorkflowEntityType = input.entityType
  const context = await resolveContext(event.context.$db, entityType, input.entityId)
  if (!context) return null
  const agreementContext = await resolveAgreementScopeContext(context.agreementId, event.context.$db)
  if (!agreementContext) return await notFound(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  const comments = input.comments ?? ''
  const result = await executeFreshAuthorizedAgreementWrite(
    event,
    event.context.$db,
    context.agreementId,
    agreementContext,
    async (trx, currentAgreementContext) => {
      const table = entityType === 'fundingcaseamendment'
        ? 'Funding_Case_Agreement_Amendment' as const
        : 'Funding_Case_Agreement_Closeout' as const
      const locked = await trx.selectFrom(table)
        .select('id')
        .where('id', '=', input.entityId)
        .where('_deleted', '=', false)
        .forUpdate()
        .executeTakeFirst()
      if (!locked) return await notFound(event, 'COMPLETION_ENTITY_NOT_FOUND', 'apiErrors.admin_common.not_found')
      if (await resolveCompletionEvidenceId(trx, entityType, input.entityId)) {
        return await badRequest(event, 'ENTITY_ALREADY_COMPLETED', 'apiErrors.request.invalid_status')
      }
      const currentUser = await resolveCurrentCommonUser(event, trx)
      if (!currentUser) return await notFound(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')
      const { completion } = await createCompletionTransition(event, trx, entityType, input.entityId, {
        initiatedBy: currentUser.id,
        comments
      })
      const hookPayload = {
        completionId: completion.id,
        entityType,
        entityId: input.entityId,
        completedByUserId: currentUser.id,
        completedAt: completion.completedAt,
        comments,
        context: {
          agreementId: currentAgreementContext.agreementId,
          streamId: currentAgreementContext.streamId,
          parentEntityType: 'fundingcaseagreement',
          parentEntityId: currentAgreementContext.agreementId
        }
      } satisfies CompletionHookPayload
      return { hookPayload, completedByUserName: currentUser.name }
    },
    {
      businessStatusMode: 'engine',
      businessStatusTarget: { entityType, entityId: input.entityId },
      authorize: async (trx, _currentContext, authContext) => {
        await authorizeFreshAssignedItem(event, trx, authContext, entityType, input.entityId)
      }
    }
  )
  const { hookPayload, completedByUserName } = result
  await emitCompletionHook(hookPayload)
  return {
    item: {
      id: hookPayload.completionId,
      egcs_cn_comments: hookPayload.comments,
      egcs_cn_user: hookPayload.completedByUserId,
      egcs_cn_user_name: completedByUserName,
      egcs_cn_completedat: hookPayload.completedAt,
      egcs_cn_disposition: 'workflow_started' as const
    },
    can_complete: false
  }
}
