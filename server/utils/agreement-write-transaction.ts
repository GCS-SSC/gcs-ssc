import { withAuditExecution } from './audit-context'
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
import { resolveAccountReceivableRuntimeContext, resolveAccountReceivableCreditMemoRuntimeContext, lockAccountReceivablePaymentPoolAgreements } from './account-receivable-context'
import { lockPaymentRecoveryAgreements } from './payment-recovery-lock'
import type { AssignableEntityType, Currency_Codes, Database } from '~~/shared/types/database'
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
import { assertAgreementCorrectionFinancialWriteAllowed, correctionLocksEntityFinancialMutation } from './correction-lock'

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
    correctionFinancialMutation?: boolean
    correctionId?: string
    accountReceivablePayees?: Array<{ applicantRecipientId: string; currency: Currency_Codes }>
    paymentRecovery?: boolean
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
        const agency = await trx
          .selectFrom('Agency_Profile')
          .select('id')
          .where('id', '=', lockContext.agencyId)
          .where('_deleted', '=', false)
          .forShare('Agency_Profile')
          .executeTakeFirst()
        const lockedStreams = await lockTransferPaymentStreams(trx, [lockContext.streamId])
        if (!lockedStreams.has(lockContext.streamId)) {
          return await throwApiError(event, {
            statusCode: 404,
            code: 'AGREEMENT_NOT_FOUND',
            key: 'apiErrors.agreement.not_found'
          })
        }
        const recoveryTarget = options.businessStatusTarget ?? (typeof options.assignmentTarget === 'object' ? options.assignmentTarget : null)
        if (recoveryTarget?.entityType === 'fundingcasepayment' || options.paymentRecovery || options.accountReceivablePayees) {
          await lockPaymentRecoveryAgreements(trx, { agreementId, agencyId: lockContext.agencyId, payees: options.accountReceivablePayees, event })
        }
        const receivableCollection = recoveryTarget?.entityType === 'fundingcaseaccountreceivable' || recoveryTarget?.entityType === 'fundingcaseaccountreceivablecreditmemo'
        if (receivableCollection && recoveryTarget) {
          const context = recoveryTarget.entityType === 'fundingcaseaccountreceivable'
            ? await resolveAccountReceivableRuntimeContext(trx, recoveryTarget.entityId)
            : await resolveAccountReceivableCreditMemoRuntimeContext(trx, recoveryTarget.entityId)
          if (!context || context.agreementId !== agreementId || context.agencyId !== lockContext.agencyId) return await forbidden(event)
          await lockAccountReceivablePaymentPoolAgreements(trx, { agreementId, agencyId: context.agencyId,
            applicantRecipientId: context.applicantRecipientId, currency: context.currency })
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

        if (options.allowDuringCloseout !== true && !receivableCollection) {
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
        // Resolve stale owner hints before rejecting the matched Agency. Its
        // share lock keeps the nondeleted parent stable through the callback.
        if (!agency) {
          return await throwApiError(event, {
            statusCode: 404,
            code: 'AGREEMENT_NOT_FOUND',
            key: 'apiErrors.agreement.not_found'
          })
        }

        try {
          if (!receivableCollection) await lockBusinessStatus(
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

        if (options.correctionFinancialMutation
          || correctionLocksEntityFinancialMutation(assignmentTarget?.entityType)
          || correctionLocksEntityFinancialMutation(options.businessStatusTarget?.entityType)) {
          const ownedCorrectionId = assignmentTarget?.entityType === 'fundingcasecorrection'
            && assignmentTarget.entityId === options.correctionId
            ? options.correctionId
            : undefined
          await assertAgreementCorrectionFinancialWriteAllowed(event, trx, agreementId, { correctionId: ownedCorrectionId })
        }

        return await withAuditExecution({ type: 'agency', agencyId: currentContext.agencyId }, () => callback(trx, currentContext, authContext))
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
