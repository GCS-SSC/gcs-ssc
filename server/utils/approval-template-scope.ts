/* eslint-disable jsdoc/require-jsdoc -- Approval-template scope helpers are covered by focused authorization tests. */
import type { H3Event } from 'h3'
import type { Kysely, Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { ApprovalTemplateScopeType } from '~~/shared/types/schemas'
import type { Scope } from '~~/shared/utils/scopes'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { badRequest, notFound, throwApiError } from '~~/server/utils/api-errors'
import {
  authorize,
  authorizeWithFreshAuthContext,
  requireFreshAuthContext,
  type AuthContext
} from '~~/server/utils/authorize'
import { lockTransferPaymentStreams } from '~~/server/utils/transfer-payment-stream-lock'
import { PublicationLifecycleConflictError } from './system-publication'

export type ApprovalTemplateScopeAction = 'read' | 'create' | 'update' | 'delete'

export type ApprovalTemplateScopeContext = {
  scopeType: ApprovalTemplateScopeType
  scopeId: string
  transferPaymentId: string | null
  agencyId: string | null
  scope: Scope | null
}

const buildTransferPaymentStreamScope = (agencyId: string, transferPaymentId: string, streamId: string): Scope => ({
  type: 'entity',
  agencyId,
  path: [
    { type: 'transfer_payment', id: transferPaymentId },
    { type: 'transfer_payment_stream', id: streamId }
  ]
})

const resolveTransferPaymentStreamApprovalTemplateScopeContext = async (
  db: Kysely<Database>,
  streamId: string
): Promise<ApprovalTemplateScopeContext | null> => {
  if (!isPositivePostgresBigintText(streamId)) return null
  const stream = await db
    .selectFrom('Transfer_Payment_Stream')
    .innerJoin(
      'Transfer_Payment_Profile',
      'Transfer_Payment_Profile.id',
      'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile'
    )
    .where('Transfer_Payment_Stream.id', '=', streamId)
    .where('Transfer_Payment_Stream._deleted', '=', false)
    .where('Transfer_Payment_Profile._deleted', '=', false)
    .select([
      'Transfer_Payment_Stream.id as stream_id',
      'Transfer_Payment_Profile.id as transfer_payment_id',
      'Transfer_Payment_Profile.egcs_tp_agency as agency_id'
    ])
    .executeTakeFirst()

  if (!stream?.agency_id || !stream.transfer_payment_id) {
    return null
  }

  const agencyId = String(stream.agency_id)
  const transferPaymentId = String(stream.transfer_payment_id)
  const resolvedStreamId = String(stream.stream_id)

  return {
    scopeType: 'transferpaymentstream',
    scopeId: resolvedStreamId,
    transferPaymentId,
    agencyId,
    scope: buildTransferPaymentStreamScope(agencyId, transferPaymentId, resolvedStreamId)
  }
}

export const isApprovalTemplateScopeSupported = (scopeType: ApprovalTemplateScopeType): boolean => scopeType === 'transferpaymentstream'

export const assertApprovalTemplateScopeSupported = async (
  event: H3Event,
  scopeType: ApprovalTemplateScopeType
) => {
  if (isApprovalTemplateScopeSupported(scopeType)) {
    return
  }

  return await badRequest(event, 'UNSUPPORTED_APPROVAL_TEMPLATE_SCOPE_TYPE', 'apiErrors.request.invalid')
}

export const respondApprovalTemplateScopeNotFound = async (
  event: H3Event,
  scopeType: ApprovalTemplateScopeType
) => {
  if (scopeType === 'transferpaymentstream') {
    return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }

  return await notFound(event, 'APPROVAL_TEMPLATE_SCOPE_NOT_FOUND', 'apiErrors.admin_common.not_found')
}

export const resolveApprovalTemplateScopeContext = async (
  db: Kysely<Database>,
  scopeType: ApprovalTemplateScopeType,
  scopeId: string
): Promise<ApprovalTemplateScopeContext | null> => {
  switch (scopeType) {
    case 'transferpaymentstream':
      return await resolveTransferPaymentStreamApprovalTemplateScopeContext(db, scopeId)
    default:
      // Future scope support belongs here. Keep the route surface generic and extend
      // this switch when a new approval-template scope is implemented.
      return null
  }
}

export const resolveApprovalTemplateScopeContextFromTemplateId = async (
  db: Kysely<Database>,
  templateId: string
): Promise<ApprovalTemplateScopeContext | null> => {
  if (!isPositivePostgresBigintText(templateId)) return null
  const template = await db
    .selectFrom('Common_Approval_Template')
    .select([
      'id',
      'egcs_cn_scopetype as scope_type',
      'egcs_cn_scopeid as scope_id'
    ])
    .where('id', '=', templateId)
    .where('_deleted', '=', false)
    .executeTakeFirst()

  if (!template) {
    return null
  }

  return await resolveApprovalTemplateScopeContext(
    db,
    template.scope_type as ApprovalTemplateScopeType,
    String(template.scope_id)
  )
}

export const authorizeApprovalTemplateScopeAction = async (
  event: H3Event,
  action: ApprovalTemplateScopeAction,
  scopeContext: ApprovalTemplateScopeContext
) => {
  switch (scopeContext.scopeType) {
    case 'transferpaymentstream':
      if (!scopeContext.scope) {
        return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
      }

      return await authorize(event, 'transfer_payment', action, async ({ context }) => {
        const canAccess = context.userAbilities.authorize(
          'transfer_payment',
          action,
          scopeContext.scope as Scope
        )
        if (canAccess) {
          return { bypass: true }
        }

        return { scope: scopeContext.scope as Scope }
      })
    default:
      // Future scope authorization belongs here alongside the matching resolver case.
      return await badRequest(event, 'UNSUPPORTED_APPROVAL_TEMPLATE_SCOPE_TYPE', 'apiErrors.request.invalid')
  }
}

/**
 * Resolves and authorizes a template without exposing missing versus inaccessible targets.
 * @param event Active request event.
 * @param action Required template action.
 * @param templateId Requested template identifier.
 * @returns Authorized template scope context.
 */
export const authorizeApprovalTemplateById = async (
  event: H3Event,
  action: Exclude<ApprovalTemplateScopeAction, 'create'>,
  templateId: string
): Promise<ApprovalTemplateScopeContext> => {
  const authorization = await authorize(event, 'transfer_payment', action, async ({ context }) => {
    const scopeContext = await resolveApprovalTemplateScopeContextFromTemplateId(event.context.$db, templateId)
    if (!scopeContext?.scope || !context.userAbilities.authorize('transfer_payment', action, scopeContext.scope)) {
      return await notFound(event, 'APPROVAL_TEMPLATE_NOT_FOUND', 'apiErrors.admin_common.not_found')
    }
    return { bypass: true, data: scopeContext }
  })
  return authorization.data!
}

/**
 * Resolves and authorizes a template scope without exposing missing versus inaccessible parents.
 * @param event Active request event.
 * @param action Required template action.
 * @param scopeType Requested scope type.
 * @param scopeId Requested scope identifier.
 * @returns Authorized template scope context.
 */
export const authorizeApprovalTemplateScope = async (
  event: H3Event,
  action: ApprovalTemplateScopeAction,
  scopeType: ApprovalTemplateScopeType,
  scopeId: string
): Promise<ApprovalTemplateScopeContext> => {
  const authorization = await authorize(event, 'transfer_payment', action, async ({ context }) => {
    const scopeContext = await resolveApprovalTemplateScopeContext(event.context.$db, scopeType, scopeId)
    if (!scopeContext?.scope || !context.userAbilities.authorize('transfer_payment', action, scopeContext.scope)) {
      return await respondApprovalTemplateScopeNotFound(event, scopeType)
    }
    return { bypass: true, data: scopeContext }
  })
  return authorization.data!
}

const authorizeApprovalTemplateScopeActionWithFreshContext = async (
  event: H3Event,
  action: ApprovalTemplateScopeAction,
  scopeContext: ApprovalTemplateScopeContext,
  authContext: AuthContext,
  _trx: Transaction<Database>
) => {
  if (!scopeContext.scope) {
    return await respondApprovalTemplateScopeNotFound(event, scopeContext.scopeType)
  }

  return await authorizeWithFreshAuthContext(
    event,
    authContext,
    'transfer_payment',
    action,
    async ({ context }) => {
      const canAccess = context.userAbilities.authorize(
        'transfer_payment',
        action,
        scopeContext.scope as Scope
      )
      return canAccess ? { bypass: true } : { scope: scopeContext.scope as Scope }
    }
  )
}

/**
 * Executes a template aggregate mutation while holding its stable stream lock.
 *
 * @param event - Request event containing the database client.
 * @param action - Protected mutation action to authorize.
 * @param scopeContext - Resolved approval-template stream scope.
 * @param callback - Aggregate mutation to run inside the locked transaction.
 * @returns Result produced by the aggregate mutation.
 */
export const executeApprovalTemplateScopeWrite = async <T>(
  event: H3Event,
  action: Extract<ApprovalTemplateScopeAction, 'create' | 'update' | 'delete'>,
  scopeContext: ApprovalTemplateScopeContext,
  callback: (
    trx: Transaction<Database>,
    currentScopeContext: ApprovalTemplateScopeContext
  ) => Promise<T>
): Promise<T> => {
  try {
    return await event.context.$db.transaction().execute(async trx => {
      const authContext = await requireFreshAuthContext(event, trx)
      const lockedStreams = await lockTransferPaymentStreams(trx, [scopeContext.scopeId])
      if (!lockedStreams.has(scopeContext.scopeId)) {
        return await respondApprovalTemplateScopeNotFound(event, scopeContext.scopeType) as T
      }

      const currentScopeContext = await resolveApprovalTemplateScopeContext(
        trx,
        scopeContext.scopeType,
        scopeContext.scopeId
      )
      if (!currentScopeContext) {
        return await respondApprovalTemplateScopeNotFound(event, scopeContext.scopeType) as T
      }

      await authorizeApprovalTemplateScopeActionWithFreshContext(
        event,
        action,
        currentScopeContext,
        authContext,
        trx
      )

      return await callback(trx, currentScopeContext)
    })
  } catch (error: unknown) {
    if (error instanceof PublicationLifecycleConflictError) {
      return await throwApiError(event, {
        statusCode: 409, code: error.code, key: 'apiErrors.request.invalid_status'
      })
    }
    throw error
  }
}
