/* eslint-disable jsdoc/require-jsdoc -- Authorization helpers use explicit typed names. */
import type { H3Event } from 'h3'
import type { Kysely, Transaction } from 'kysely'
import type { AbilityAction } from '~~/shared/utils/abilities'
import type { Database } from '~~/shared/types/database'
import type { AttachmentTarget, AttachmentTargetEntityType } from '~~/shared/types/schemas'
import { notFound, forbidden } from './api-errors'
import { resolveEntityAssignmentOwner } from './entity-assignment'
import { authorizeAssignedTarget, requireAuthContext, requireFreshAuthContext, type AuthContext } from './authorize'
import { resolveAgreementScopeContext, type AgreementScopeContext } from './agreement'
import { executeFreshAuthorizedAgreementWrite } from './agreement-write-transaction'
import { executeFreshAuthorizedApplicantRecipientWrite, lockActiveApplicantRecipientIds } from './applicant-recipient-auth'

export interface ResolvedAttachmentTarget {
  target: AttachmentTarget
  agencyId: string
  agreementContext?: AgreementScopeContext
}

export const resolveAttachmentTarget = async (
  db: Kysely<Database>,
  target: AttachmentTarget
): Promise<ResolvedAttachmentTarget | null> => {
  const owner = await resolveEntityAssignmentOwner(db, target.entityType, target.entityId)
  if (!owner) return null
  if (owner.kind === 'applicant_recipient') {
    return { target, agencyId: owner.agencyId }
  }
  if (owner.kind !== 'agreement') return null
  const agreementContext = await resolveAgreementScopeContext(owner.agreementId, db)
  if (!agreementContext) return null
  return { target, agencyId: owner.agencyId, agreementContext }
}

export const authorizeAttachmentTarget = async (
  event: H3Event,
  target: AttachmentTarget,
  action: AbilityAction
): Promise<{ auth: AuthContext; resolved: ResolvedAttachmentTarget }> => {
  const auth = await requireAuthContext(event)
  const resolved = await resolveAttachmentTarget(event.context.$db, target)
  if (!resolved) return await notFound(event, 'ATTACHMENT_TARGET_NOT_FOUND', 'apiErrors.attachments.target_not_found')
  const permitted = resolved.agreementContext
    ? auth.userAbilities.authorize('agreement', action, resolved.agreementContext.scope)
    : auth.userAbilities.authorize('applicant_recipient', action, { type: 'agency', agencyId: resolved.agencyId })
  if (!permitted) return await forbidden(event)
  if (action !== 'read') await authorizeAssignedTarget(event, target)
  return { auth, resolved }
}

export const authorizeFreshAttachmentTarget = async (
  event: H3Event,
  target: AttachmentTarget,
  action: AbilityAction,
  db: Kysely<Database>
): Promise<{ auth: AuthContext; resolved: ResolvedAttachmentTarget }> => {
  const auth = await requireFreshAuthContext(event, db)
  const resolved = await resolveAttachmentTarget(db, target)
  if (!resolved) return await notFound(event, 'ATTACHMENT_TARGET_NOT_FOUND', 'apiErrors.attachments.target_not_found')
  const permitted = resolved.agreementContext
    ? auth.userAbilities.authorize('agreement', action, resolved.agreementContext.scope)
    : auth.userAbilities.authorize('applicant_recipient', action, { type: 'agency', agencyId: resolved.agencyId })
  if (!permitted) return await forbidden(event)
  return { auth, resolved }
}

export const executeFreshAuthorizedAttachmentWrite = async <T>(
  event: H3Event,
  target: AttachmentTarget,
  action: 'update' | 'delete',
  callback: (
    trx: Transaction<Database>,
    auth: AuthContext,
    resolved: ResolvedAttachmentTarget
  ) => Promise<T>
): Promise<T> => {
  const initial = await resolveAttachmentTarget(event.context.$db, target)
  if (!initial) return await notFound(event, 'ATTACHMENT_TARGET_NOT_FOUND', 'apiErrors.attachments.target_not_found')

  if (target.entityType === 'applicantrecipient') {
    return await executeFreshAuthorizedApplicantRecipientWrite(
      event,
      event.context.$db,
      target.entityId,
      action,
      async (trx, auth) => {
        if (!await lockActiveApplicantRecipientIds(trx, [target.entityId])) {
          return await forbidden(event)
        }
        const fresh = await resolveAttachmentTarget(trx, target)
        if (!fresh) return await notFound(event, 'ATTACHMENT_TARGET_NOT_FOUND', 'apiErrors.attachments.target_not_found')
        return await callback(trx, auth, fresh)
      }
    )
  }

  if (!initial.agreementContext) return await forbidden(event)
  return await executeFreshAuthorizedAgreementWrite(
    event,
    event.context.$db,
    initial.agreementContext.agreementId,
    initial.agreementContext,
    async (trx, agreementContext, auth) => await callback(trx, auth, {
      target,
      agencyId: agreementContext.agencyId,
      agreementContext
    }),
    {
      action,
      assignmentTarget: target,
      businessStatusTarget: target as { entityType: Exclude<AttachmentTargetEntityType, 'applicantrecipient'>; entityId: string }
    }
  )
}
