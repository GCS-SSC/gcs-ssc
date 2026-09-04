/* eslint-disable jsdoc/require-jsdoc -- Existing helpers use descriptive names and narrow types. */
import type { H3Event } from 'h3'
import {
  badRequest,
  notFound
} from '~~/server/utils/api-errors'
import { resolveCurrentCommonUser } from '~~/server/utils/additional-reviewer-runtime'
import {
  assertNoCompletedFinalAgreementClaimReconcile,
  hasCompletedFinalAgreementClaimReconcile,
  lockAgreementClaimReconcileEditable,
  resolveAgreementClaimReconcileRuntimeContext
} from '~~/server/utils/agreement-claim'
import {
  emitCompletionHook,
  resolveCompletionEvidenceId,
  resolveCompletionRecord
} from '~~/server/utils/completion-runtime-core'
import { createCompletionTransition } from '~~/server/utils/workflow-runtime'
import type { CompletionHookPayload } from '~~/shared/types/completion'
import type {
  CompletionExecuteInput
} from '~~/shared/types/schemas/completion'
import { resolveAgreementScopeContext } from '~~/server/utils/agreement'
import {
  executeFreshAuthorizedAgreementWrite
} from '~~/server/utils/agreement-write-transaction'
import { authorizeFreshAssignedItem } from '~~/server/utils/authorize'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'

export const getAgreementClaimReconcileCompletionRuntime = async (
  event: H3Event,
  reconcileId: string
) => {
  return await executeFreshReadSnapshot(event, async trx => {
    const context = await resolveAgreementClaimReconcileRuntimeContext(trx, reconcileId)
    if (!context) return null
    const item = await resolveCompletionRecord(trx, 'fundingclaimreconcile', reconcileId)
    const reconcile = await trx
      .selectFrom('Funding_Case_Agreement_Claim_Reconcile')
      .select(['egcs_fc_status', 'egcs_fc_isopen'])
      .where('id', '=', reconcileId)
      .where('_deleted', '=', false)
      .executeTakeFirst()

    const hasCompletedFinalReconcile = await hasCompletedFinalAgreementClaimReconcile(trx, context.claimId)
    const status = reconcile
      ? await trx.selectFrom('Common_Status').select(['egcs_cn_readonly', 'egcs_cn_terminal'])
          .where('id', '=', reconcile.egcs_fc_status).where('_deleted', '=', false).executeTakeFirst()
      : null
    const line = await trx.selectFrom('Funding_Case_Agreement_Claim_Reconcile_Line_Item')
      .select('id').where('egcs_fc_fundingagreementclaimreconcile', '=', reconcileId).where('_deleted', '=', false).executeTakeFirst()

    return {
      item,
      can_complete: item === null
        && Boolean(reconcile)
        && reconcile?.egcs_fc_isopen !== false
        && Boolean(line)
        && !hasCompletedFinalReconcile
        && Boolean(status && !status.egcs_cn_readonly && !status.egcs_cn_terminal),
      blocker: item
        ? null
        : hasCompletedFinalReconcile
          ? 'final_reconcile_approved' as const
          : !line
              ? 'lines_required' as const
              : !status || status.egcs_cn_readonly || status.egcs_cn_terminal
                  ? 'business_status' as const
                  : null
    }
  })
}

export const executeAgreementClaimReconcileCompletion = async (
  event: H3Event,
  input: CompletionExecuteInput
) => {
  const db = event.context.$db
  const reconcileId = input.entityId
  const context = await resolveAgreementClaimReconcileRuntimeContext(db, reconcileId)
  if (!context) {
    return null
  }
  const agreementContext = await resolveAgreementScopeContext(context.agreementId, db)
  if (!agreementContext) {
    return null
  }

  const reconcile = await db
    .selectFrom('Funding_Case_Agreement_Claim_Reconcile')
    .select([
      'id',
      'egcs_fc_status',
      'egcs_fc_isfinal',
      'egcs_fc_isopen'
    ])
    .where('id', '=', reconcileId)
    .where('_deleted', '=', false)
    .executeTakeFirst()

  if (!reconcile) {
    return await notFound(event, 'AGREEMENT_CLAIM_RECONCILE_NOT_FOUND', 'apiErrors.agreement.claim_reconcile_not_found')
  }

  const status = await db.selectFrom('Common_Status').select(['egcs_cn_readonly', 'egcs_cn_terminal'])
    .where('id', '=', reconcile.egcs_fc_status).where('_deleted', '=', false).executeTakeFirst()
  if (reconcile.egcs_fc_isopen === false || !status || status.egcs_cn_readonly || status.egcs_cn_terminal) {
    return await badRequest(event, 'AGREEMENT_CLAIM_RECONCILE_LOCKED', 'apiErrors.request.invalid_status')
  }

  const finalLock = await assertNoCompletedFinalAgreementClaimReconcile(event, db, context.claimId)
  if (finalLock) {
    return finalLock
  }

  const existingCompletion = await resolveCompletionEvidenceId(db, 'fundingclaimreconcile', reconcileId)
  if (existingCompletion) {
    return await badRequest(event, 'AGREEMENT_CLAIM_RECONCILE_ALREADY_COMPLETED', 'apiErrors.request.invalid_status')
  }

  const lineCount = await db
    .selectFrom('Funding_Case_Agreement_Claim_Reconcile_Line_Item')
    .select(({ fn }) => fn.count('id').as('total'))
    .where('egcs_fc_fundingagreementclaimreconcile', '=', reconcileId)
    .where('_deleted', '=', false)
    .executeTakeFirst()

  if (Number(lineCount?.total ?? 0) === 0) {
    return await badRequest(event, 'AGREEMENT_CLAIM_RECONCILE_LINES_REQUIRED', 'apiErrors.request.invalid_status')
  }

  const currentCommonUser = await resolveCurrentCommonUser(event)
  if (!currentCommonUser) {
    return await notFound(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')
  }

  const comments = input.comments ?? ''

  const hookPayload = await executeFreshAuthorizedAgreementWrite(event, db, context.agreementId, agreementContext, async (trx, currentContext) => {
    const lockedReconcile = await lockAgreementClaimReconcileEditable(
      event,
      trx,
      context.agreementId,
      reconcileId
    )
    if (!lockedReconcile || typeof lockedReconcile !== 'object' || !('id' in lockedReconcile) || !('egcs_fc_isfinal' in lockedReconcile)) {
      return await notFound(event, 'AGREEMENT_CLAIM_RECONCILE_NOT_FOUND', 'apiErrors.agreement.claim_reconcile_not_found')
    }

    const currentLineCount = await trx
      .selectFrom('Funding_Case_Agreement_Claim_Reconcile_Line_Item')
      .select(({ fn }) => fn.count('id').as('total'))
      .where('egcs_fc_fundingagreementclaimreconcile', '=', reconcileId)
      .where('_deleted', '=', false)
      .executeTakeFirst()
    if (Number(currentLineCount?.total ?? 0) === 0) {
      return await badRequest(event, 'AGREEMENT_CLAIM_RECONCILE_LINES_REQUIRED', 'apiErrors.request.invalid_status')
    }

    const { completion: createdCompletion } = await createCompletionTransition(
      event,
      trx,
      'fundingclaimreconcile',
      reconcileId,
      {
        comments,
        initiatedBy: currentCommonUser.id
      }
    )

    const completionHookPayload: CompletionHookPayload = {
      completionId: createdCompletion.id,
      entityType: 'fundingclaimreconcile',
      entityId: reconcileId,
      completedByUserId: currentCommonUser.id,
      completedAt: createdCompletion.completedAt,
      comments,
      context: {
        agreementId: currentContext.profileId,
        streamId: currentContext.streamId,
        parentEntityType: 'fundingcaseagreement',
        parentEntityId: currentContext.profileId
      }
    }

    return completionHookPayload
  }, {
    businessStatusMode: 'engine',
    businessStatusTarget: { entityType: 'fundingclaimreconcile', entityId: reconcileId },
    authorize: async (trx, _currentContext, authContext) => {
      await lockAgreementClaimReconcileEditable(event, trx, context.agreementId, reconcileId)
      await authorizeFreshAssignedItem(event, trx, authContext, 'fundingclaimreconcile', reconcileId)
    }
  })

  await emitCompletionHook(hookPayload)

  return {
    item: {
      id: hookPayload.completionId,
      egcs_cn_comments: hookPayload.comments,
      egcs_cn_user: hookPayload.completedByUserId,
      egcs_cn_user_name: currentCommonUser.name,
      egcs_cn_completedat: hookPayload.completedAt
    },
    can_complete: false
  }
}
