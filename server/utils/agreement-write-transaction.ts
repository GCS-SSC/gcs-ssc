/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns -- Temporary coverage while transaction helpers receive complete API documentation. */
import type { H3Event } from 'h3'
import type { Kysely, Transaction } from 'kysely'
import { forbidden, throwApiError } from '~~/server/utils/api-errors'
import {
  authorizeFreshAssignedItem,
  requireFreshAuthContext,
  type AuthContext
} from '~~/server/utils/authorize'
import {
  resolveAgreementScopeContext,
  type AgreementScopeContext
} from '~~/server/utils/agreement'
import {
  lockRegisteredExtensionAgreementLifecycle,
  lockRegisteredExtensionAgreementScopes
} from '~~/server/utils/extensions'
import type { AssignableEntityType, Database } from '~~/shared/types/database'
import type { CoreLifecycleEntityType } from '~~/shared/constants/entity-registry'
import type { StatusId } from '~~/shared/types/status'
import type { AbilityAction } from '~~/shared/utils/abilities'
import { lockTransferPaymentStreams } from '~~/server/utils/transfer-payment-stream-lock'
import type { ExactEntityTarget } from '@gcs-ssc/authorization'
import { resolveAssignmentTargetAgreementId } from '~~/server/utils/agreement-assignment-target'
import { assertAgreementApprovalSubmissionUnlocked } from '~~/server/utils/agreement-approval-submission'
import { hasActiveAgreementCloseoutWorkflow } from '~~/server/utils/agreement-closeout'
import {
  BusinessStatusViolation,
  lockBusinessStatus,
  type BusinessStatusMutationMode
} from '~~/server/utils/business-status-runtime'

class AgreementWriteScopeChanged extends Error {
  constructor(readonly context: AgreementScopeContext) {
    super('Agreement scope changed while acquiring write lifecycle locks.')
  }
}

const AGREEMENT_WRITE_SCOPE_LOCK_MAX_ATTEMPTS = 3

const agreementScopeMatches = (
  expected: AgreementScopeContext,
  current: AgreementScopeContext
): boolean => expected.agencyId === current.agencyId
  && expected.profileId === current.profileId
  && expected.streamId === current.streamId

const resolveExplicitAssignmentTarget = async (
  target: ExactEntityTarget<AssignableEntityType> | ((trx: Transaction<Database>) => Promise<ExactEntityTarget<AssignableEntityType> | null>),
  trx: Transaction<Database>
): Promise<ExactEntityTarget<AssignableEntityType> | null> => {
  if (typeof target === 'function') return await target(trx)
  return target
}

/** Revalidates the role ceiling and exact casework assignment for approval-management actions. */
export const authorizeFreshAgreementUpdate = async (
  event: H3Event,
  trx: Transaction<Database>,
  agreementContext: AgreementScopeContext,
  authContext: AuthContext,
  target: ExactEntityTarget<AssignableEntityType>,
  action: AbilityAction = 'update'
): Promise<void> => {
  const targetAgreementId = await resolveAssignmentTargetAgreementId(trx, target, { lockIdentity: true })
  if (targetAgreementId !== agreementContext.agreementId) return await forbidden(event)
  await authorizeFreshAssignedItem(event, trx, authContext, target.entityType, target.entityId, action)
}

/** Validates the active common-user identity for an approval actor. */
export const authorizeFreshAgreementApprovalActor = async (
  event: H3Event,
  trx: Transaction<Database>,
  _agreementContext: AgreementScopeContext,
  authContext: AuthContext,
  commonUserId: string
): Promise<void> => {
  const actor = await trx
    .selectFrom('user')
    .innerJoin('Common_User', 'Common_User.egcs_cn_auth_user_id', 'user.id')
    .select('Common_User.id')
    .where('user.id', '=', authContext.userId)
    .where('Common_User.id', '=', commonUserId)
    .where('user._deleted', '=', false)
    .where('Common_User._deleted', '=', false)
    .executeTakeFirst()

  if (!actor) {
    await forbidden(event)
  }
}

export const lockAgreementProfileForUpdate = async (
  trx: Transaction<Database>,
  agreementId: string
): Promise<{ id: string, status: StatusId } | null> => {
  const agreement = await trx
    .selectFrom('Funding_Case_Agreement_Profile')
    .where('id', '=', agreementId)
    .where('_deleted', '=', false)
    .select(['id', 'egcs_fc_status'])
    .forUpdate()
    .executeTakeFirst()
  return agreement ? { id: String(agreement.id), status: agreement.egcs_fc_status } : null
}

/** Rejects ordinary writes when Closeout owns or has terminated the Agreement aggregate lifecycle. */
export const assertAgreementCloseoutWriteAllowed = async (
  event: H3Event,
  trx: Transaction<Database>,
  agreementId: string,
  agreementStatus: StatusId
): Promise<void> => {
  const definition = await trx.selectFrom('Common_Status').select('egcs_cn_terminal')
    .where('id', '=', agreementStatus).where('_deleted', '=', false).forUpdate().executeTakeFirst()
  if (definition?.egcs_cn_terminal) {
    return await throwApiError(event, {
      statusCode: 409, code: 'AGREEMENT_CLOSED', key: 'apiErrors.agreement.closed'
    })
  }
  if (await hasActiveAgreementCloseoutWorkflow(trx, agreementId)) {
    return await throwApiError(event, {
      statusCode: 409, code: 'AGREEMENT_CLOSEOUT_LOCKED', key: 'apiErrors.agreement.closeout_locked'
    })
  }
}

/** Executes an agreement write only after its current scope and grants are locked and revalidated. */
export const executeFreshAuthorizedAgreementWrite = async <T>(
  event: H3Event,
  db: Kysely<Database>,
  agreementId: string,
  initialContext: AgreementScopeContext,
  callback: (
    trx: Transaction<Database>,
    agreementContext: AgreementScopeContext,
    authContext: AuthContext
  ) => Promise<T>,
  options: {
    action?: AbilityAction
    lockUserIds?: string[]
    authorize?: (
      trx: Transaction<Database>,
      agreementContext: AgreementScopeContext,
      authContext: AuthContext
    ) => Promise<void>
    assignmentTarget?: ExactEntityTarget<AssignableEntityType> | ((trx: Transaction<Database>) => Promise<ExactEntityTarget<AssignableEntityType> | null>)
    blocksApprovalSubmission?: boolean
    allowDuringCloseout?: boolean
    businessStatusMode?: BusinessStatusMutationMode
    businessStatusTarget?: ExactEntityTarget<CoreLifecycleEntityType>
  } = {}
): Promise<T> => {
  let lockContext = initialContext
  let lockAttempt = 0

  while (lockAttempt < AGREEMENT_WRITE_SCOPE_LOCK_MAX_ATTEMPTS) {
    lockAttempt += 1
    try {
      return await db.transaction().execute(async trx => {
        // Global protected-write order starts with the caller's grant graph.
        const authContext = await requireFreshAuthContext(event, trx, { lockUserIds: options.lockUserIds })
        await lockRegisteredExtensionAgreementScopes(
          trx,
          lockContext.agencyId,
          [lockContext.streamId]
        )
        const lockedStreams = await lockTransferPaymentStreams(trx, [lockContext.streamId])
        if (!lockedStreams.has(lockContext.streamId)) {
          return await throwApiError(event, {
            statusCode: 404,
            code: 'AGREEMENT_NOT_FOUND',
            key: 'apiErrors.agreement.not_found'
          })
        }
        await lockRegisteredExtensionAgreementLifecycle(event, trx, {
          agreementId,
          agencyId: lockContext.agencyId,
          currentStreamId: lockContext.streamId,
          targetStreamIds: [lockContext.streamId]
        })

        const lockedAgreement = await lockAgreementProfileForUpdate(trx, agreementId)
        if (!lockedAgreement) {
          return await throwApiError(event, {
            statusCode: 404,
            code: 'AGREEMENT_NOT_FOUND',
            key: 'apiErrors.agreement.not_found'
          })
        }

        if (options.allowDuringCloseout !== true) {
          await assertAgreementCloseoutWriteAllowed(event, trx, agreementId, lockedAgreement.status)
        }

        const currentContext = await resolveAgreementScopeContext(agreementId, trx)
        if (!currentContext) {
          return await throwApiError(event, {
            statusCode: 404,
            code: 'AGREEMENT_NOT_FOUND',
            key: 'apiErrors.agreement.not_found'
          })
        }
        if (!agreementScopeMatches(lockContext, currentContext)) {
          throw new AgreementWriteScopeChanged(currentContext)
        }

        try {
          await lockBusinessStatus(
            trx,
            'fundingcaseagreement',
            agreementId,
            options.businessStatusMode ?? (options.allowDuringCloseout === true ? 'engine' : 'ordinary')
          )
          if (options.businessStatusTarget && options.businessStatusTarget.entityType !== 'fundingcaseagreement') {
            const targetStatus = await lockBusinessStatus(
              trx,
              options.businessStatusTarget.entityType,
              options.businessStatusTarget.entityId,
              options.businessStatusMode ?? (options.allowDuringCloseout === true ? 'engine' : 'ordinary')
            )
            if (targetStatus.agreementId !== agreementId) {
              throw new BusinessStatusViolation('BUSINESS_STATUS_AGENCY_MISMATCH', 'Business status target belongs to another Agreement')
            }
          }
        } catch (error: unknown) {
          if (!(error instanceof BusinessStatusViolation)) throw error
          return await throwApiError(event, {
            statusCode: 409,
            code: error.code,
            key: 'apiErrors.request.invalid_status'
          })
        }

        const assignmentTarget = options.assignmentTarget
          ? await resolveExplicitAssignmentTarget(options.assignmentTarget, trx)
          : null

        if (options.authorize) {
          await options.authorize(trx, currentContext, authContext)
        } else if (options.assignmentTarget) {
          if (!assignmentTarget) return await forbidden(event)
          const targetAgreementId = await resolveAssignmentTargetAgreementId(trx, assignmentTarget, { lockIdentity: true })
          if (targetAgreementId !== agreementId) return await forbidden(event)
          await authorizeFreshAssignedItem(
            event,
            trx,
            authContext,
            assignmentTarget.entityType,
            assignmentTarget.entityId,
            options.action ?? 'update'
          )
        } else {
          const action = options.action ?? 'update'
          await authorizeFreshAssignedItem(
            event,
            trx,
            authContext,
            'fundingcaseagreement',
            agreementId,
            action
          )
        }

        const blocksApprovalSubmission = options.blocksApprovalSubmission
          ?? assignmentTarget?.entityType === 'fundingcaseamendment'
        if (blocksApprovalSubmission) {
          await assertAgreementApprovalSubmissionUnlocked(event, trx, agreementId)
        }

        return await callback(trx, currentContext, authContext)
      })
    } catch (error: unknown) {
      if (!(error instanceof AgreementWriteScopeChanged)) {
        throw error
      }
      if (lockAttempt === AGREEMENT_WRITE_SCOPE_LOCK_MAX_ATTEMPTS) {
        return await throwApiError(event, {
          statusCode: 409,
          code: 'AGREEMENT_SCOPE_CHANGED',
          key: 'apiErrors.agreement.scope_changed'
        })
      }
      lockContext = error.context
    }
  }

  return await throwApiError(event, {
    statusCode: 409,
    code: 'AGREEMENT_SCOPE_CHANGED',
    key: 'apiErrors.agreement.scope_changed'
  })
}
