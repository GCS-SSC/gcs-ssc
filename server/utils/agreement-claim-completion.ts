/* eslint-disable jsdoc/require-jsdoc -- Agreement Claim completion follows the shared completion runtime contract. */
import type { H3Event } from 'h3'
import { resolveCurrentCommonUser } from '~~/server/utils/additional-reviewer-runtime'
import { resolveAgreementScopeContext } from '~~/server/utils/agreement'
import { resolveAgreementClaimRuntimeContext } from '~~/server/utils/agreement-claim'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { authorizeFreshAssignedItem } from '~~/server/utils/authorize'
import { resolveBusinessStatusProtection } from '~~/server/utils/business-status-runtime'
import {
  emitCompletionHook,
  resolveCompletionEvidenceId,
  resolveCompletionRecord
} from '~~/server/utils/completion-runtime-core'
import { createCompletionTransition } from '~~/server/utils/workflow-runtime'
import type { CompletionHookPayload } from '~~/shared/types/completion'
import type { CompletionExecuteInput } from '~~/shared/types/schemas/completion'

type ClaimLineAllocation = { egcs_fc_fundingagreementbudgetlineitem?: string | null }

const areClaimLinesReady = (claimLines: ClaimLineAllocation[]): boolean =>
  claimLines.length > 0 && claimLines.every(line =>
    line.egcs_fc_fundingagreementbudgetlineitem !== null
    && line.egcs_fc_fundingagreementbudgetlineitem !== undefined
  )

export const getAgreementClaimCompletionRuntime = async (
  event: H3Event,
  claimId: string
) => {
  const context = await resolveAgreementClaimRuntimeContext(event.context.$db, claimId)
  if (!context) return null

  const item = await resolveCompletionRecord(event.context.$db, 'fundingcaseagreementclaim', claimId)
  const protection = await resolveBusinessStatusProtection(
    event.context.$db,
    'fundingcaseagreementclaim',
    claimId
  )
  const claimLines = await event.context.$db.selectFrom('Funding_Case_Agreement_Claim_Line_Item')
    .select('egcs_fc_fundingagreementbudgetlineitem')
    .where('egcs_fc_fundingagreementclaim', '=', claimId)
    .where('_deleted', '=', false)
    .execute()
  const hasClaimLines = claimLines.length > 0
  const claimLinesReady = areClaimLinesReady(claimLines)

  return {
    item,
    can_complete: item === null && claimLinesReady && Boolean(protection && !protection.locked),
    blocker: item
      ? null
      : !hasClaimLines
          ? 'claim_lines_required' as const
          : !claimLinesReady
              ? 'claim_lines_unallocated' as const
              : !protection || protection.locked
                  ? 'business_status' as const
                  : null
  }
}

export const executeAgreementClaimCompletion = async (
  event: H3Event,
  input: CompletionExecuteInput
) => {
  const db = event.context.$db
  const claimId = input.entityId
  const context = await resolveAgreementClaimRuntimeContext(db, claimId)
  if (!context) return null

  const agreementContext = await resolveAgreementScopeContext(context.agreementId, db)
  if (!agreementContext) {
    return await notFound(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  }
  const currentCommonUser = await resolveCurrentCommonUser(event)
  if (!currentCommonUser) {
    return await notFound(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')
  }
  const comments = input.comments ?? ''

  const hookPayload = await executeFreshAuthorizedAgreementWrite(
    event,
    db,
    context.agreementId,
    agreementContext,
    async (trx, currentAgreementContext) => {
      const claim = await trx.selectFrom('Funding_Case_Agreement_Claim')
        .select('id')
        .where('id', '=', claimId)
        .where('egcs_fc_fundingagreement', '=', context.agreementId)
        .where('_deleted', '=', false)
        .forUpdate()
        .executeTakeFirst()
      if (!claim) {
        return await notFound(event, 'AGREEMENT_CLAIM_NOT_FOUND', 'apiErrors.agreement.claim_not_found')
      }

      const protection = await resolveBusinessStatusProtection(trx, 'fundingcaseagreementclaim', claimId)
      if (!protection || protection.locked) {
        return await badRequest(event, 'AGREEMENT_CLAIM_LOCKED', 'apiErrors.request.invalid_status')
      }

      const claimLines = await trx.selectFrom('Funding_Case_Agreement_Claim_Line_Item')
        .select(['id', 'egcs_fc_fundingagreementbudgetlineitem'])
        .where('egcs_fc_fundingagreementclaim', '=', claimId)
        .where('_deleted', '=', false)
        .orderBy('id', 'asc')
        .forUpdate()
        .execute()
      if (claimLines.length === 0) {
        return await badRequest(event, 'AGREEMENT_CLAIM_LINES_REQUIRED', 'apiErrors.request.invalid_status')
      }
      if (!areClaimLinesReady(claimLines)) {
        return await badRequest(event, 'AGREEMENT_CLAIM_LINES_UNALLOCATED', 'apiErrors.agreement.claim_lines_unallocated')
      }

      if (await resolveCompletionEvidenceId(trx, 'fundingcaseagreementclaim', claimId)) {
        return await badRequest(event, 'AGREEMENT_CLAIM_ALREADY_COMPLETED', 'apiErrors.request.invalid_status')
      }

      const { completion: createdCompletion } = await createCompletionTransition(
        event,
        trx,
        'fundingcaseagreementclaim',
        claimId,
        {
          comments,
          initiatedBy: currentCommonUser.id
        }
      )
      const completionHookPayload: CompletionHookPayload = {
        completionId: createdCompletion.id,
        entityType: 'fundingcaseagreementclaim',
        entityId: claimId,
        completedByUserId: currentCommonUser.id,
        completedAt: createdCompletion.completedAt,
        comments,
        context: {
          agreementId: currentAgreementContext.agreementId,
          streamId: currentAgreementContext.streamId,
          parentEntityType: 'fundingcaseagreement',
          parentEntityId: currentAgreementContext.agreementId
        }
      }

      return completionHookPayload
    },
    {
      businessStatusMode: 'engine',
      businessStatusTarget: { entityType: 'fundingcaseagreementclaim', entityId: claimId },
      authorize: async (trx, _currentAgreementContext, authContext) => {
        await authorizeFreshAssignedItem(
          event,
          trx,
          authContext,
          'fundingcaseagreementclaim',
          claimId
        )
      }
    }
  )

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
