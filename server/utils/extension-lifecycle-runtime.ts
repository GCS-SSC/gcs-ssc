/* eslint-disable jsdoc/require-jsdoc -- public host bridge is covered by lifecycle contract tests */
import type { H3Event } from 'h3'
import type { Transaction } from 'kysely'
import type { Database, Entity_Type } from '~~/shared/types/database'
import type { CompletionExecuteInput } from '~~/shared/types/schemas/completion'
import { forbidden, throwApiError } from './api-errors'
import { resolveCurrentCommonUser } from './additional-reviewer-runtime'
import { requireAuthContext } from './authorize'
import { canAccessAgreement, resolveAgreementScopeContext } from './agreement'
import { canAccessApplicantRecipient } from './applicant-recipient-auth'
import {
  createCompletionRecord,
  emitCompletionHook,
  resolveCompletionEvidenceId,
  resolveCompletionRecord
} from './completion-runtime-core'
import {
  extensionLifecycleAdapterContext as adapterContext,
  extensionLifecycleTarget as targetFor,
  type ResolvedExtensionLifecycleRuntime
} from './extension-lifecycle-context'
import { resolveActiveWorkflowSetup, startWorkflow } from './workflow-runtime'
import {
  authorizeQualifiedRuntimeMutation,
  executeQualifiedRuntimeTransaction,
  resolveQualifiedRuntimeTransactionPlan
} from './qualified-runtime-transaction'

export const resolveExtensionLifecycleRuntime = async (
  event: H3Event,
  entityType: Entity_Type,
  entityId: string
): Promise<ResolvedExtensionLifecycleRuntime | null> => {
  return await resolveQualifiedRuntimeTransactionPlan(event, entityType, entityId)
}

export const authorizeExtensionLifecycleRead = async (
  event: H3Event,
  runtime: ResolvedExtensionLifecycleRuntime
) => {
  const auth = await requireAuthContext(event)
  const owner = runtime.lockedEntity.owner
  const allowed = owner.owner === 'agreement'
    ? await (async () => {
        const agreement = await resolveAgreementScopeContext(owner.ownerId, event.context.$db)
        return agreement ? await canAccessAgreement(auth, 'read', agreement.scope, event.context.$db) : false
      })()
    : await canAccessApplicantRecipient(auth, owner.ownerId, 'read', event.context.$db)
  return allowed ? auth : await forbidden(event)
}

/**
 * Runs an extension lifecycle mutation under the host-owned fresh authorization,
 * canonical lifecycle-scope/owner/entity locks, and exact-assignment contract.
 * @param event - Active request event.
 * @param initial - Initially resolved adapter target used to plan locks.
 * @param work - Mutation executed with the freshly locked adapter context.
 * @param options - Additional authorization locks acquired before fresh authorization is rebuilt.
 * @param options.lockUserIds - Application-user identifiers to lock for roster eligibility checks.
 * @returns The mutation result, or null when the target disappeared.
 */
export const executeExtensionLifecycleWrite = async <Result>(
  event: H3Event,
  initial: ResolvedExtensionLifecycleRuntime,
  work: (
    trx: Transaction<Database>,
    current: ResolvedExtensionLifecycleRuntime,
    actorUserId: string
  ) => Promise<Result>,
  options: { lockUserIds?: string[] } = {}
): Promise<Result | null> => {
  return await executeQualifiedRuntimeTransaction(event, initial, {
    lockUserIds: options.lockUserIds,
    authorize: async evidence => {
      const owner = evidence.runtime.lockedEntity.owner
      const assignmentTarget = evidence.runtime.loaded.definition.assignmentMode === 'independent'
        ? targetFor(evidence.runtime.context.entityType, evidence.runtime.context.entityId)
        : {
            entityType: owner.owner === 'agreement' ? 'fundingcaseagreement' as const : 'applicantrecipient' as const,
            entityId: owner.ownerId
          }
      await authorizeQualifiedRuntimeMutation(evidence, assignmentTarget)
    },
    work: async evidence => await work(
      evidence.trx,
      evidence.runtime,
      evidence.actorUserId
    )
  })
}

export const getExtensionCompletionRuntime = async (
  event: H3Event,
  runtime: ResolvedExtensionLifecycleRuntime
) => {
  const item = await resolveCompletionRecord(
    event.context.$db,
    runtime.context.entityType,
    runtime.context.entityId
  )
  return {
    item,
    can_complete: item === null
      && !runtime.lockedEntity.status.readOnly
      && !runtime.lockedEntity.status.terminal
  }
}

export const executeExtensionCompletion = async (
  event: H3Event,
  input: CompletionExecuteInput
) => {
  const actor = await resolveCurrentCommonUser(event)
  if (!actor) return await forbidden(event)
  const initial = await resolveExtensionLifecycleRuntime(event, input.entityType, input.entityId)
  if (!initial || initial.loaded.definition.completion !== 'supported') return null

  const payload = await executeQualifiedRuntimeTransaction(event, initial, {
    missingRuntime: 'entity_locked',
    work: async evidence => {
      const { runtime: current, trx } = evidence
      if (current.lockedEntity.status.readOnly || current.lockedEntity.status.terminal) {
        return await throwApiError(event, {
          statusCode: 409,
          code: 'EXTENSION_LIFECYCLE_ENTITY_LOCKED',
          key: 'apiErrors.request.invalid_status'
        })
      }
      const owner = current.lockedEntity.owner
      const assignmentTarget = current.loaded.definition.assignmentMode === 'independent'
        ? targetFor(input.entityType, input.entityId)
        : {
            entityType: owner.owner === 'agreement' ? 'fundingcaseagreement' as const : 'applicantrecipient' as const,
            entityId: owner.ownerId
          }
      await authorizeQualifiedRuntimeMutation(evidence, assignmentTarget)
      if (await resolveCompletionEvidenceId(trx, input.entityType, input.entityId)) {
        return await throwApiError(event, {
          statusCode: 409,
          code: 'COMPLETION_ALREADY_EXISTS',
          key: 'apiErrors.request.invalid_status'
        })
      }

      const activeWorkflow = await trx.selectFrom('Common_Runtime').select('id')
        .where('egcs_cn_kind', '=', 'workflow')
        .where('egcs_cn_entitytype', '=', input.entityType)
        .where('egcs_cn_entityid', '=', input.entityId)
        .where('egcs_cn_state', 'in', ['pending', 'active', 'awaiting_action', 'paused'])
        .where('_deleted', '=', false)
        .forUpdate()
        .executeTakeFirst()
      if (activeWorkflow) {
        return await throwApiError(event, {
          statusCode: 409,
          code: 'WORKFLOW_ACTIVE',
          key: 'apiErrors.workflow.active_workflow'
        })
      }
      const definition = current.loaded.definition
      const setup = definition.approvalSubmission === 'on_completion'
        ? await resolveActiveWorkflowSetup(trx, current.context, 'approval_submission', true)
        : null
      const completion = await createCompletionRecord(trx, {
        entityType: input.entityType,
        entityId: input.entityId,
        comments: input.comments ?? '',
        userId: actor.id,
        disposition: setup ? 'workflow_started' : 'no_workflow'
      })
      await current.loaded.adapter.validateCompletion(adapterContext(event, trx, actor.id), {
        completionId: completion.id,
        lockedEntity: current.lockedEntity
      })
      const workflow = setup
        ? await startWorkflow(event, trx, current.context, actor.id, {
            completionId: completion.id,
            purpose: 'approval_submission',
            selectedSetup: setup
          })
        : null
      if (setup && !workflow) throw new Error('Extension Workflow materialization failed')
      if (!workflow && current.loaded.adapter.onPositiveTerminus) {
        await current.loaded.adapter.onPositiveTerminus(adapterContext(event, trx, actor.id), {
          completionId: completion.id,
          lockedEntity: current.lockedEntity
        })
      }
      return { completion, workflow }
    }
  })
  if (!payload) return null
  await emitCompletionHook({
    entityType: input.entityType,
    entityId: input.entityId,
    completionId: payload.completion.id,
    completedAt: payload.completion.completedAt,
    completedByUserId: actor.id,
    comments: input.comments ?? ''
  })
  return await getExtensionCompletionRuntime(event, initial)
}
