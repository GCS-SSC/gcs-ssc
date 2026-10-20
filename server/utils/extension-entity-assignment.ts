/* eslint-disable jsdoc/require-jsdoc -- host-side extension roster bridge is exercised through assignment routes */
import type { H3Event } from 'h3'
import type { Kysely, Transaction } from 'kysely'
import type { AuthorizationResourceOwner } from '@gcs-ssc/authorization'
import type { Database, Entity_Type } from '~~/shared/types/database'
import { forbidden, notFound } from './api-errors'
import { requireAuthContext } from './authorize'
import { resolveAgreementScopeContext } from './agreement'
import { resolveCompletionEvidenceId } from './completion-runtime-core'
import { executeQualifiedRuntimeTransaction } from './qualified-runtime-transaction'
import {
  authorizeExtensionLifecycleRead,
  resolveExtensionLifecycleRuntime
} from './extension-lifecycle-runtime'
import {
  resolveExtensionEligibleAssigneeIds,
  type ResolvedExtensionLifecycleRuntime
} from './extension-lifecycle-context'

const toOwner = (runtime: ResolvedExtensionLifecycleRuntime): AuthorizationResourceOwner => {
  const owner = runtime.lockedEntity.owner
  return owner.owner === 'agreement'
    ? { kind: 'agreement', agreementId: owner.ownerId, agencyId: owner.agencyId }
    : { kind: 'applicant_recipient', applicantRecipientId: owner.ownerId, agencyId: owner.agencyId }
}

const hasManageGrant = async (
  context: Awaited<ReturnType<typeof requireAuthContext>>,
  db: Kysely<Database> | Transaction<Database>,
  runtime: ResolvedExtensionLifecycleRuntime
): Promise<boolean> => {
  const owner = runtime.lockedEntity.owner
  if (owner.owner === 'agreement') {
    const agreement = await resolveAgreementScopeContext(owner.ownerId, db as Kysely<Database>)
    return Boolean(agreement && context.userAbilities.canManageAssignments('agreement', agreement.scope))
  }
  return context.userAbilities.canManageAssignments('applicant_recipient', {
    type: 'agency', agencyId: owner.agencyId
  })
}

export const resolveExtensionEntityAssignmentRuntime = async (
  event: H3Event,
  entityType: Entity_Type,
  entityId: string
): Promise<ResolvedExtensionLifecycleRuntime | null> => {
  const runtime = await resolveExtensionLifecycleRuntime(event, entityType, entityId)
  return runtime?.loaded.definition.assignmentMode === 'independent' ? runtime : null
}

export const authorizeExtensionEntityAssignmentRead = async (
  event: H3Event,
  runtime: ResolvedExtensionLifecycleRuntime
) => {
  const auth = await requireAuthContext(event)
  if (await hasManageGrant(auth, event.context.$db, runtime)) return auth
  return await authorizeExtensionLifecycleRead(event, runtime)
}

export const resolveExtensionEntityAssignmentOwner = (
  runtime: ResolvedExtensionLifecycleRuntime
): AuthorizationResourceOwner => toOwner(runtime)

export const canManageExtensionEntityAssignments = async (
  event: H3Event,
  runtime: ResolvedExtensionLifecycleRuntime
): Promise<boolean> => {
  if (runtime.lockedEntity.status.readOnly || runtime.lockedEntity.status.terminal) return false
  if (await resolveCompletionEvidenceId(event.context.$db, runtime.context.entityType, runtime.context.entityId)) return false
  const auth = await requireAuthContext(event)
  return await hasManageGrant(auth, event.context.$db, runtime)
}

export const executeExtensionEntityAssignmentManagement = async <Result>(
  event: H3Event,
  runtime: ResolvedExtensionLifecycleRuntime,
  callback: (trx: Transaction<Database>) => Promise<Result>,
  assigneeUserId?: string
): Promise<Result | null> => {
  const assigneeApplicationUserId = assigneeUserId
    ? await event.context.$db.selectFrom('Common_User')
        .select('egcs_cn_authuserid')
        .where('id', '=', assigneeUserId)
        .where('_deleted', '=', false)
        .executeTakeFirst()
    : undefined
  return await executeQualifiedRuntimeTransaction(event, runtime, {
    lockUserIds: assigneeApplicationUserId ? [String(assigneeApplicationUserId.egcs_cn_authuserid)] : [],
    work: async ({ trx, auth, runtime: current }) => {
      if (!await hasManageGrant(auth, trx, current)) return await forbidden(event)
      if (current.lockedEntity.status.readOnly || current.lockedEntity.status.terminal) return await forbidden(event)
      if (await resolveCompletionEvidenceId(trx, current.context.entityType, current.context.entityId)) return await forbidden(event)
      if (assigneeUserId) {
        const eligible = await resolveExtensionEligibleAssigneeIds(trx, current, [assigneeUserId])
        if (!eligible.has(assigneeUserId)) return await forbidden(event)
      }
      const identity = await trx.selectFrom('Common_Entity').select('id')
        .where('id', '=', current.context.entityId)
        .where('egcs_cn_entitytype', '=', current.context.entityType)
        .where('_deleted', '=', false)
        .forUpdate().executeTakeFirst()
      if (!identity) return await notFound(event, 'ASSIGNMENT_TARGET_NOT_FOUND', 'apiErrors.request.not_found')
      await trx.selectFrom('Common_Entity_Assignment').select('id')
        .where('egcs_cn_entityid', '=', current.context.entityId)
        .where('egcs_cn_entitytype', '=', current.context.entityType)
        .where('_deleted', '=', false)
        .orderBy('id').forUpdate().execute()
      return await callback(trx)
    }
  })
}
