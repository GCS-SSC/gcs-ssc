/* eslint-disable jsdoc/require-jsdoc -- low-level adapter context is covered by lifecycle host-contract tests */
import { createError, type H3Event } from 'h3'
import type { Kysely, Transaction } from 'kysely'
import type {
  GcsLifecycleEntityAdapterContext,
  GcsLifecycleEntityOwnerResolution,
  GcsLifecycleEntityScopeResolution,
  GcsLockedLifecycleEntity
} from '@gcs-ssc/extensions/server'
import type { Database, Entity_Type } from '~~/shared/types/database'
import type { ReviewRuntimeEntityContext } from './review-runtime-access'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { throwApiError } from './api-errors'
import { resolveAgreementScopeContext } from './agreement'
import { defineUsersAbilities } from './rbac'
import {
  isExtensionEnabledForAgency,
  isExtensionEnabledForStream,
  loadExtensionLifecycleEntity,
  type LoadedExtensionLifecycleEntity
} from './extensions'

type DbClient = Kysely<Database> | Transaction<Database>

export type ResolvedExtensionLifecycleRuntime = {
  loaded: LoadedExtensionLifecycleEntity
  context: ReviewRuntimeEntityContext
  lockedEntity: GcsLockedLifecycleEntity
}

export const extensionLifecycleTarget = (entityType: Entity_Type, entityId: string) => ({
  entityType: entityType as `${string}:${string}`,
  entityId
})

export const extensionLifecycleAdapterContext = (
  event: H3Event | null,
  trx: Transaction<Database>,
  actorUserId: string
): GcsLifecycleEntityAdapterContext => ({ event, transaction: trx as never, actorUserId })

type CanonicalLifecycleIdentity = {
  owner: GcsLifecycleEntityOwnerResolution
  scope: GcsLifecycleEntityScopeResolution
}

const throwLifecycleIdentityChanged = async (event: H3Event | null): Promise<never> => {
  if (event) {
    return await throwApiError(event, {
      statusCode: 409,
      code: 'EXTENSION_LIFECYCLE_IDENTITY_CHANGED',
      key: 'apiErrors.request.invalid_status'
    })
  }
  const message = 'Extension lifecycle identity changed.'
  throw createError({
    statusCode: 409,
    message,
    data: { message, code: 'EXTENSION_LIFECYCLE_IDENTITY_CHANGED' }
  })
}

const ownersMatch = (
  reported: GcsLifecycleEntityOwnerResolution,
  canonical: GcsLifecycleEntityOwnerResolution
): boolean => reported.owner === canonical.owner
  && reported.ownerId === canonical.ownerId
  && reported.agencyId === canonical.agencyId
  && (reported.streamId ?? null) === (canonical.streamId ?? null)

const extensionScopesMatch = (
  reported: GcsLifecycleEntityScopeResolution['scope'],
  canonical: GcsLifecycleEntityScopeResolution['scope']
): boolean => {
  if (reported.type !== canonical.type) return false
  if (reported.type === 'global') return canonical.type === 'global'
  if (reported.type === 'agency') {
    return canonical.type === 'agency' && reported.agencyId === canonical.agencyId
  }
  return canonical.type === 'entity'
    && reported.agencyId === canonical.agencyId
    && reported.path.length === canonical.path.length
    && reported.path.every((part, index) => {
      const canonicalPart = canonical.path[index]
      return canonicalPart?.type === part.type && canonicalPart.id === part.id
    })
}

const scopesMatch = (
  reported: GcsLifecycleEntityScopeResolution,
  canonical: GcsLifecycleEntityScopeResolution
): boolean => reported.agencyId === canonical.agencyId
  && (reported.streamId ?? null) === (canonical.streamId ?? null)
  && extensionScopesMatch(reported.scope, canonical.scope)

const resolveCanonicalLifecycleIdentity = async (
  trx: Transaction<Database>,
  entityType: Entity_Type,
  entityId: string
): Promise<CanonicalLifecycleIdentity | null> => {
  const binding = await trx.selectFrom('Common_Extension_Entity_Owner')
    .select(['egcs_cn_ownerid as ownerId', 'egcs_cn_ownertype as ownerType'])
    .where('egcs_cn_entityid', '=', entityId)
    .where('egcs_cn_entitytype', '=', entityType)
    .executeTakeFirst()
  if (!binding || !isPositivePostgresBigintText(String(binding.ownerId))) return null
  if (binding.ownerType !== 'fundingcaseagreement' && binding.ownerType !== 'applicantrecipient') return null

  const ownerEntityType = binding.ownerType
  const identity = await trx.selectFrom('Common_Entity').select('id')
    .where('id', '=', String(binding.ownerId))
    .where('egcs_cn_entitytype', '=', ownerEntityType)
    .where('_deleted', '=', false)
    .executeTakeFirst()
  if (!identity) return null

  const ownerId = String(identity.id)
  if (ownerEntityType === 'fundingcaseagreement') {
    const agreement = await resolveAgreementScopeContext(ownerId, trx)
    if (!agreement) return null
    return {
      owner: {
        owner: 'agreement',
        ownerId,
        agencyId: agreement.agencyId,
        streamId: agreement.streamId
      },
      scope: {
        agencyId: agreement.agencyId,
        streamId: agreement.streamId,
        scope: {
          type: 'entity',
          agencyId: agreement.agencyId,
          path: [{ type: 'transferpaymentstream', id: agreement.streamId }]
        }
      }
    }
  }

  const profile = await trx.selectFrom('Applicant_Recipient_Profile')
    .innerJoin('Agency_Profile', 'Agency_Profile.id', 'Applicant_Recipient_Profile.egcs_ar_leadagency')
    .select('Applicant_Recipient_Profile.egcs_ar_leadagency as agencyId')
    .where('Applicant_Recipient_Profile.id', '=', ownerId)
    .where('Applicant_Recipient_Profile._deleted', '=', false)
    .where('Agency_Profile._deleted', '=', false)
    .executeTakeFirst()
  if (!profile?.agencyId) return null
  const agencyId = String(profile.agencyId)
  return {
    owner: { owner: 'proponent', ownerId, agencyId },
    scope: { agencyId, scope: { type: 'agency', agencyId } }
  }
}

const isEnabled = async (
  db: DbClient,
  loaded: LoadedExtensionLifecycleEntity,
  entity: GcsLockedLifecycleEntity
): Promise<boolean> => {
  if (!await isExtensionEnabledForAgency(db as Kysely<Database>, loaded.extension.key, entity.owner.agencyId)) return false
  return !entity.scope.streamId
    || await isExtensionEnabledForStream(db as Kysely<Database>, loaded.extension.key, entity.scope.streamId)
}

const toRuntimeContext = (entity: GcsLockedLifecycleEntity): ReviewRuntimeEntityContext => ({
  entityType: entity.target.entityType,
  entityId: entity.target.entityId,
  agreementId: entity.owner.owner === 'agreement' ? entity.owner.ownerId : null,
  applicantRecipientLeadAgencyId: entity.owner.owner === 'proponent' ? entity.owner.agencyId : null,
  schemaAgencyId: entity.owner.agencyId,
  reviewSetId: null,
  reviewId: null,
  setupScopes: [
    {
      scopeType: entity.owner.owner === 'agreement' ? 'fundingcaseagreement' : 'applicantrecipient',
      scopeId: entity.owner.ownerId
    },
    ...(entity.scope.streamId
      ? [{ scopeType: 'transferpaymentstream' as const, scopeId: entity.scope.streamId }]
      : [])
  ]
})

export const resolveExtensionLifecycleRuntimeInTransaction = async (
  trx: Transaction<Database>,
  entityType: Entity_Type,
  entityId: string,
  actorUserId: string,
  event: H3Event | null = null
): Promise<ResolvedExtensionLifecycleRuntime | null> => {
  const loaded = await loadExtensionLifecycleEntity(entityType)
  if (!loaded) return null
  const identity = await trx.selectFrom('Common_Entity').select('id')
    .where('id', '=', entityId).where('egcs_cn_entitytype', '=', entityType).where('_deleted', '=', false)
    .executeTakeFirst()
  if (!identity) return null
  const canonicalIdentity = await resolveCanonicalLifecycleIdentity(trx, entityType, entityId)
  if (!canonicalIdentity) return await throwLifecycleIdentityChanged(event)
  const lockedEntity = await loaded.adapter.lockEntity(
    extensionLifecycleAdapterContext(event, trx, actorUserId),
    extensionLifecycleTarget(entityType, entityId)
  )
  if (!lockedEntity) return null
  if (lockedEntity.target.entityType !== entityType || lockedEntity.target.entityId !== entityId) {
    return await throwLifecycleIdentityChanged(event)
  }
  const adapterContext = extensionLifecycleAdapterContext(event, trx, actorUserId)
  const [resolvedOwner, resolvedScope] = [
    await loaded.adapter.resolveOwner(adapterContext, lockedEntity.target),
    await loaded.adapter.resolveScope(adapterContext, lockedEntity.target)
  ]
  if (!resolvedOwner
    || !resolvedScope
    || lockedEntity.owner.owner !== loaded.definition.ownerKind
    || resolvedOwner.owner !== loaded.definition.ownerKind
    || lockedEntity.assignmentMode !== loaded.definition.assignmentMode) {
    return await throwLifecycleIdentityChanged(event)
  }
  if (!ownersMatch(lockedEntity.owner, canonicalIdentity.owner)
    || !ownersMatch(resolvedOwner, canonicalIdentity.owner)
    || !scopesMatch(lockedEntity.scope, canonicalIdentity.scope)
    || !scopesMatch(resolvedScope, canonicalIdentity.scope)) {
    return await throwLifecycleIdentityChanged(event)
  }
  const canonicalEntity: GcsLockedLifecycleEntity = {
    ...lockedEntity,
    target: extensionLifecycleTarget(entityType, entityId),
    owner: canonicalIdentity.owner,
    scope: canonicalIdentity.scope,
    assignmentMode: loaded.definition.assignmentMode
  }
  if (!await isEnabled(trx, loaded, canonicalEntity)) return null
  return { loaded, lockedEntity: canonicalEntity, context: toRuntimeContext(canonicalEntity) }
}

export const resolveExtensionEligibleAssigneeIds = async (
  db: DbClient,
  runtime: ResolvedExtensionLifecycleRuntime,
  commonUserIds: string[]
): Promise<Set<string>> => {
  const uniqueIds = [...new Set(commonUserIds.map(String))]
  if (uniqueIds.length === 0) return new Set()
  const users = await db.selectFrom('Common_User')
    .innerJoin('user', 'user.id', 'Common_User.egcs_cn_auth_user_id')
    .select(['Common_User.id as commonUserId', 'user.id as applicationUserId'])
    .where('Common_User.id', 'in', uniqueIds)
    .where('Common_User._deleted', '=', false)
    .where('user._deleted', '=', false)
    .execute()
  const abilities = await defineUsersAbilities(
    users.map(user => String(user.applicationUserId)),
    db as Kysely<Database>
  )
  const owner = runtime.lockedEntity.owner
  const agreement = owner.owner === 'agreement'
    ? await resolveAgreementScopeContext(owner.ownerId, db as Kysely<Database>)
    : null
  return new Set(users.filter(user => {
    const ability = abilities.get(String(user.applicationUserId))
    if (!ability) return false
    return owner.owner === 'agreement'
      ? Boolean(agreement && ability.authorize('agreement', 'update', agreement.scope))
      : ability.authorize('applicant_recipient', 'update', { type: 'agency', agencyId: owner.agencyId })
  }).map(user => String(user.commonUserId)))
}
