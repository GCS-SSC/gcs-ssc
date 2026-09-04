/* eslint-disable jsdoc/require-jsdoc -- Transaction boundary is covered by focused authorization tests. */
import type { H3Event } from 'h3'
import type { Kysely, Transaction } from 'kysely'
import { notFound, throwApiError } from '~~/server/utils/api-errors'
import {
  authorizeWithFreshAuthContext,
  requireFreshAuthContext
} from '~~/server/utils/authorize'
import type { AuthContext } from '~~/server/utils/authorize'
import { lockRegisteredExtensionAgreementScopes } from '~~/server/utils/extensions'
import type { Database } from '~~/shared/types/database'
import type { AbilityAction } from '~~/shared/utils/abilities'
import type { Scope } from '~~/shared/utils/scopes'
import { PublicationLifecycleConflictError } from './system-publication'
import { getDatabaseConstraintName } from './database-constraint-errors'

export type TransferPaymentWriteContext = {
  profileId: string
  agencyId: string
  scope: Scope
}

export type TransferPaymentStreamWriteContext = TransferPaymentWriteContext & {
  streamId: string
}

class TransferPaymentWriteScopeChanged extends Error {
  constructor(readonly agencyId: string) {
    super('Transfer-payment scope changed while acquiring write locks.')
  }
}

const TRANSFER_PAYMENT_WRITE_SCOPE_LOCK_MAX_ATTEMPTS = 3

const buildTransferPaymentWriteContext = (
  profileId: string,
  agencyId: string
): TransferPaymentWriteContext => ({
  profileId,
  agencyId,
  scope: {
    type: 'entity',
    agencyId,
    path: [{ type: 'transfer_payment', id: profileId }]
  }
})

export const executeFreshAuthorizedTransferPaymentWrite = async <T>(
  event: H3Event,
  db: Kysely<Database>,
  profileId: string,
  initialAgencyId: string,
  action: AbilityAction,
  callback: (
    trx: Transaction<Database>,
    context: TransferPaymentWriteContext,
    authContext: AuthContext
  ) => Promise<T>
): Promise<T> => {
  let lockAgencyId = initialAgencyId

  for (let attempt = 0; attempt < TRANSFER_PAYMENT_WRITE_SCOPE_LOCK_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await db.transaction().execute(async trx => {
        const authContext = await requireFreshAuthContext(event, trx)
        await lockRegisteredExtensionAgreementScopes(trx, lockAgencyId, [])
        const profile = await trx
          .selectFrom('Transfer_Payment_Profile')
          .select('egcs_tp_agency')
          .where('id', '=', profileId)
          .where('_deleted', '=', false)
          .forUpdate('Transfer_Payment_Profile')
          .executeTakeFirst()

        if (!profile) {
          return await notFound(
            event,
            'TRANSFER_PAYMENT_PROFILE_NOT_FOUND',
            'apiErrors.transfer_payment.profile_not_found'
          )
        }

        const currentAgencyId = String(profile.egcs_tp_agency)
        if (currentAgencyId !== lockAgencyId) {
          throw new TransferPaymentWriteScopeChanged(currentAgencyId)
        }

        const context = buildTransferPaymentWriteContext(profileId, currentAgencyId)
        await authorizeWithFreshAuthContext(
          event,
          authContext,
          'transfer_payment',
          action,
          async ({ context: freshContext }) => {
            const canAccess = freshContext.userAbilities.authorize(
              'transfer_payment',
              action,
              context.scope
            )
            if (canAccess) return { bypass: true }
            return { scope: context.scope }
          }
        )

        return await callback(trx, context, authContext)
      })
    } catch (error: unknown) {
      const workflowStatusConstraint = getDatabaseConstraintName(error)
      if (['cn_idx_workflowallowedstartstatus', 'cn_idx_workflowallowedstartorder', 'cn_ref_workflowstatusagency'].includes(workflowStatusConstraint ?? '')) {
        return await throwApiError(event, {
          statusCode: 409,
          code: 'WORKFLOW_STATUS_CONFLICT',
          key: 'apiErrors.request.invalid_status'
        })
      }
      if (error instanceof PublicationLifecycleConflictError) {
        return await throwApiError(event, {
          statusCode: 409, code: error.code, key: 'apiErrors.request.invalid_status'
        })
      }
      if (!(error instanceof TransferPaymentWriteScopeChanged)) throw error
      lockAgencyId = error.agencyId
    }
  }

  return await throwApiError(event, {
    statusCode: 409,
    code: 'TRANSFER_PAYMENT_PROFILE_SCOPE_CHANGED',
    key: 'apiErrors.transfer_payment.profile_scope_changed'
  })
}

export const executeFreshAuthorizedTransferPaymentStreamWrite = async <T>(
  event: H3Event,
  db: Kysely<Database>,
  profileId: string,
  initialAgencyId: string,
  streamId: string,
  action: AbilityAction,
  callback: (
    trx: Transaction<Database>,
    context: TransferPaymentStreamWriteContext,
    authContext: AuthContext
  ) => Promise<T>
): Promise<T> => {
  let lockAgencyId = initialAgencyId

  for (let attempt = 0; attempt < TRANSFER_PAYMENT_WRITE_SCOPE_LOCK_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await db.transaction().execute(async trx => {
        const authContext = await requireFreshAuthContext(event, trx)
        await lockRegisteredExtensionAgreementScopes(trx, lockAgencyId, [streamId])
        const profile = await trx
          .selectFrom('Transfer_Payment_Profile')
          .select('egcs_tp_agency')
          .where('id', '=', profileId)
          .where('_deleted', '=', false)
          .forUpdate('Transfer_Payment_Profile')
          .executeTakeFirst()

        if (!profile) {
          return await notFound(
            event,
            'TRANSFER_PAYMENT_PROFILE_NOT_FOUND',
            'apiErrors.transfer_payment.profile_not_found'
          )
        }

        const currentAgencyId = String(profile.egcs_tp_agency)
        if (currentAgencyId !== lockAgencyId) {
          throw new TransferPaymentWriteScopeChanged(currentAgencyId)
        }

        const stream = await trx
          .selectFrom('Transfer_Payment_Stream')
          .select('id')
          .where('id', '=', streamId)
          .where('egcs_tp_transferpaymentprofile', '=', profileId)
          .where('_deleted', '=', false)
          .forUpdate('Transfer_Payment_Stream')
          .executeTakeFirst()

        if (!stream) {
          return await notFound(
            event,
            'TRANSFER_PAYMENT_STREAM_NOT_FOUND',
            'apiErrors.transfer_payment.stream_not_found'
          )
        }

        const context = { ...buildTransferPaymentWriteContext(profileId, currentAgencyId), streamId }
        await authorizeWithFreshAuthContext(
          event,
          authContext,
          'transfer_payment',
          action,
          context.scope
        )
        return await callback(trx, context, authContext)
      })
    } catch (error: unknown) {
      const workflowStatusConstraint = getDatabaseConstraintName(error)
      if (['cn_idx_workflowallowedstartstatus', 'cn_idx_workflowallowedstartorder', 'cn_ref_workflowstatusagency'].includes(workflowStatusConstraint ?? '')) {
        return await throwApiError(event, {
          statusCode: 409,
          code: 'WORKFLOW_STATUS_CONFLICT',
          key: 'apiErrors.request.invalid_status'
        })
      }
      if (error instanceof PublicationLifecycleConflictError) {
        return await throwApiError(event, {
          statusCode: 409,
          code: error.code,
          key: 'apiErrors.request.invalid_status'
        })
      }
      if (!(error instanceof TransferPaymentWriteScopeChanged)) throw error
      lockAgencyId = error.agencyId
    }
  }

  return await throwApiError(event, {
    statusCode: 409,
    code: 'TRANSFER_PAYMENT_PROFILE_SCOPE_CHANGED',
    key: 'apiErrors.transfer_payment.profile_scope_changed'
  })
}
