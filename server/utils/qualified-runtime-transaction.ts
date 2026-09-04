/* eslint-disable jsdoc/require-jsdoc -- canonical qualified-runtime orchestration is covered by focused lifecycle tests */
import type { H3Event } from 'h3'
import type { Transaction } from 'kysely'
import { lockGcsExtensionLifecycleScope } from '@gcs-ssc/extensions/server'
import type { GcsLockedLifecycleEntity } from '@gcs-ssc/extensions/server'
import type { AuthContext } from './authorize'
import type { Database, Entity_Type } from '~~/shared/types/database'
import { forbidden, throwApiError } from './api-errors'
import { resolveCurrentCommonUser } from './additional-reviewer-runtime'
import { requireFreshAuthContext } from './authorize'
import { resolveAgreementScopeContext } from './agreement'
import { resolveAssignedItemGrant } from './rbac'
import {
  resolveExtensionLifecycleRuntimeInTransaction,
  type ResolvedExtensionLifecycleRuntime
} from './extension-lifecycle-context'

export type QualifiedRuntimeLockEvidence = {
  actorUserId: string
  auth: AuthContext
  event: H3Event
  runtime: ResolvedExtensionLifecycleRuntime
  trx: Transaction<Database>
}

type QualifiedRuntimeTransactionOptions<Result> = {
  authorize?: (evidence: QualifiedRuntimeLockEvidence) => Promise<void>
  lockUserIds?: string[]
  missingRuntime?: 'entity_locked' | 'identity_changed'
  missingOwner?: 'identity_changed' | 'null'
  work: (evidence: QualifiedRuntimeLockEvidence) => Promise<Result>
}

const lockedQualifiedRuntimeTransactions = new WeakMap<object, QualifiedRuntimeLockEvidence>()

const hasSameHostOwnerIdentity = (
  initial: GcsLockedLifecycleEntity,
  current: GcsLockedLifecycleEntity
): boolean => current.owner.owner === initial.owner.owner
  && current.owner.ownerId === initial.owner.ownerId
  && current.owner.agencyId === initial.owner.agencyId
  && current.owner.streamId === initial.owner.streamId

const hasSameLifecycleLockIdentity = (
  initial: GcsLockedLifecycleEntity,
  current: GcsLockedLifecycleEntity
): boolean => hasSameHostOwnerIdentity(initial, current)
  && current.scope.agencyId === initial.scope.agencyId
  && current.scope.streamId === initial.scope.streamId

const lockHostOwner = async (
  trx: Transaction<Database>,
  entity: GcsLockedLifecycleEntity
) => {
  if (entity.owner.owner === 'agreement') {
    return await trx.selectFrom('Funding_Case_Agreement_Profile').select('id')
      .where('id', '=', entity.owner.ownerId).where('_deleted', '=', false).forUpdate().executeTakeFirst()
  }
  return await trx.selectFrom('Applicant_Recipient_Profile').select('id')
    .where('id', '=', entity.owner.ownerId).where('_deleted', '=', false).forUpdate().executeTakeFirst()
}

export const resolveQualifiedRuntimeTransactionPlan = async (
  event: H3Event,
  entityType: Entity_Type,
  entityId: string
): Promise<ResolvedExtensionLifecycleRuntime | null> => {
  if (!entityType.includes(':')) return null
  const actor = await resolveCurrentCommonUser(event)
  if (!actor) return null
  return await event.context.$db.transaction().execute(async trx =>
    await resolveExtensionLifecycleRuntimeInTransaction(trx, entityType, entityId, actor.id, event))
}

export const executeQualifiedRuntimeTransaction = async <Result>(
  event: H3Event,
  initial: ResolvedExtensionLifecycleRuntime,
  options: QualifiedRuntimeTransactionOptions<Result>
): Promise<Result | null> => {
  const actor = await resolveCurrentCommonUser(event)
  if (!actor) return await forbidden(event)

  return await event.context.$db.transaction().execute(async trx => {
    const auth = await requireFreshAuthContext(event, trx, { lockUserIds: options.lockUserIds })
    await lockGcsExtensionLifecycleScope(
      trx as never,
      initial.loaded.extension.key,
      initial.lockedEntity.owner.agencyId,
      initial.lockedEntity.scope.streamId
    )
    if (!await lockHostOwner(trx, initial.lockedEntity)) {
      if (options.missingOwner !== 'identity_changed') return null
      return await throwApiError(event, {
        statusCode: 409,
        code: 'EXTENSION_LIFECYCLE_IDENTITY_CHANGED',
        key: 'apiErrors.request.invalid_status'
      })
    }
    const current = await resolveExtensionLifecycleRuntimeInTransaction(
      trx,
      initial.context.entityType,
      initial.context.entityId,
      actor.id,
      event
    )
    if (!current && options.missingRuntime === 'entity_locked') {
      return await throwApiError(event, {
        statusCode: 409,
        code: 'EXTENSION_LIFECYCLE_ENTITY_LOCKED',
        key: 'apiErrors.request.invalid_status'
      })
    }
    if (!current || !hasSameLifecycleLockIdentity(initial.lockedEntity, current.lockedEntity)) {
      return await throwApiError(event, {
        statusCode: 409,
        code: 'EXTENSION_LIFECYCLE_IDENTITY_CHANGED',
        key: 'apiErrors.request.invalid_status'
      })
    }

    const evidence: QualifiedRuntimeLockEvidence = {
      actorUserId: actor.id,
      auth,
      event,
      runtime: current,
      trx
    }
    lockedQualifiedRuntimeTransactions.set(trx, evidence)
    try {
      await options.authorize?.(evidence)
      return await options.work(evidence)
    } finally {
      lockedQualifiedRuntimeTransactions.delete(trx)
    }
  })
}

export const authorizeQualifiedRuntimeMutation = async (
  evidence: QualifiedRuntimeLockEvidence,
  assignmentTarget: { entityType: Entity_Type, entityId: string },
  action: 'read' | 'update' | 'delete' = 'update'
): Promise<void> => {
  const owner = evidence.runtime.lockedEntity.owner
  const hasRole = owner.owner === 'agreement'
    ? await (async () => {
        const agreement = await resolveAgreementScopeContext(owner.ownerId, evidence.trx)
        return Boolean(agreement && evidence.auth.userAbilities.authorize('agreement', action, agreement.scope))
      })()
    : evidence.auth.userAbilities.authorize('applicant_recipient', action, {
        type: 'agency', agencyId: owner.agencyId
      })
  if (!hasRole) return await forbidden(evidence.event)

  if (!await resolveAssignedItemGrant(
    evidence.auth.userId,
    assignmentTarget.entityType,
    assignmentTarget.entityId,
    evidence.trx,
    { lock: true }
  )) return await forbidden(evidence.event)
}

export const getQualifiedRuntimeLockEvidence = (
  trx: Transaction<Database>,
  entityType: Entity_Type,
  entityId: string
): QualifiedRuntimeLockEvidence | null => {
  const evidence = lockedQualifiedRuntimeTransactions.get(trx)
  return evidence?.runtime.context.entityType === entityType
    && evidence.runtime.context.entityId === entityId
    ? evidence
    : null
}

export const requireQualifiedRuntimeLockEvidence = (
  trx: Transaction<Database>,
  entityType: Entity_Type,
  entityId: string
): QualifiedRuntimeLockEvidence => {
  const evidence = getQualifiedRuntimeLockEvidence(trx, entityType, entityId)
  if (!evidence) {
    throw new Error(`Qualified runtime ${entityType}:${entityId} requires canonical lifecycle lock evidence`)
  }
  return evidence
}
