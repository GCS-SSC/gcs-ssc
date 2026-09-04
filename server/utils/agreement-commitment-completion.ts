/* eslint-disable jsdoc/require-jsdoc -- Existing helpers use descriptive names and narrow types. */
import type { H3Event } from 'h3'
import type { Transaction } from 'kysely'
import {
  badRequest,
  notFound
} from '~~/server/utils/api-errors'
import {
  lockAgreementCommitmentEditable,
  resolveAgreementCommitmentRuntimeContext
} from '~~/server/utils/agreement-commitment'
import {
  emitCompletionHook,
  resolveCompletionEvidenceId,
  resolveCompletionRecord
} from '~~/server/utils/completion-runtime-core'
import { createCompletionTransition } from '~~/server/utils/workflow-runtime'
import type { CompletionHookPayload } from '~~/shared/types/completion'
import type { Database } from '~~/shared/types/database'
import type {
  CompletionExecuteInput
} from '~~/shared/types/schemas/completion'
import { resolveAgreementScopeContext } from '~~/server/utils/agreement'
import {
  executeFreshAuthorizedAgreementWrite
} from '~~/server/utils/agreement-write-transaction'
import { authorizeFreshAssignedItem } from '~~/server/utils/authorize'
import { resolveBusinessStatusProtection } from '~~/server/utils/business-status-runtime'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'

const resolveFreshCurrentCommonUser = async (
  trx: Transaction<Database>,
  authUserId: string
) => {
  const commonUser = await trx
    .selectFrom('user')
    .innerJoin('Common_User', 'Common_User.egcs_cn_auth_user_id', 'user.id')
    .select([
      'Common_User.id as id',
      'Common_User.egcs_cn_name as name'
    ])
    .where('user.id', '=', authUserId)
    .where('user._deleted', '=', false)
    .where('Common_User._deleted', '=', false)
    .forUpdate('Common_User')
    .executeTakeFirst()

  return commonUser
    ? { id: String(commonUser.id), name: commonUser.name }
    : null
}

export const getAgreementCommitmentCompletionRuntime = async (
  event: H3Event,
  commitmentId: string
) => {
  return await executeFreshReadSnapshot(event, async trx => {
    const context = await resolveAgreementCommitmentRuntimeContext(trx, commitmentId)
    if (!context) return null
    const item = await resolveCompletionRecord(trx, 'fundingcaseagreementcommitment', commitmentId)
    const protection = await resolveBusinessStatusProtection(trx, 'fundingcaseagreementcommitment', commitmentId)
    const line = await trx.selectFrom('Funding_Case_Agreement_Commitment_Line')
      .select('id').where('egcs_fc_commitment', '=', commitmentId).where('_deleted', '=', false).executeTakeFirst()

    return {
      item,
      can_complete: item === null
        && Boolean(line)
        && Boolean(protection && !protection.locked),
      blocker: item ? null : !line ? 'lines_required' as const : !protection || protection.locked ? 'business_status' as const : null
    }
  })
}

export const executeAgreementCommitmentCompletion = async (
  event: H3Event,
  input: CompletionExecuteInput
) => {
  const db = event.context.$db
  const commitmentId = input.entityId
  const context = await resolveAgreementCommitmentRuntimeContext(db, commitmentId)
  if (!context) {
    return null
  }
  const agreementContext = await resolveAgreementScopeContext(context.agreementId, db)
  if (!agreementContext) {
    return null
  }

  const commitment = await db
    .selectFrom('Funding_Case_Agreement_Commitment')
    .select([
      'id',
      'egcs_fc_status'
    ])
    .where('id', '=', commitmentId)
    .where('_deleted', '=', false)
    .executeTakeFirst()

  if (!commitment) {
    return await notFound(event, 'AGREEMENT_COMMITMENT_NOT_FOUND', 'apiErrors.agreement.commitment_not_found')
  }

  const protection = await resolveBusinessStatusProtection(db, 'fundingcaseagreementcommitment', commitmentId)
  if (!protection || protection.locked) {
    return await badRequest(event, 'AGREEMENT_COMMITMENT_LOCKED', 'apiErrors.request.invalid_status')
  }

  const existingCompletion = await resolveCompletionEvidenceId(db, 'fundingcaseagreementcommitment', commitmentId)
  if (existingCompletion) {
    return await badRequest(event, 'AGREEMENT_COMMITMENT_ALREADY_COMPLETED', 'apiErrors.request.invalid_status')
  }

  const lineCount = await db
    .selectFrom('Funding_Case_Agreement_Commitment_Line')
    .select(({ fn }) => fn.count('id').as('total'))
    .where('egcs_fc_commitment', '=', commitmentId)
    .where('_deleted', '=', false)
    .executeTakeFirst()

  if (Number(lineCount?.total ?? 0) === 0) {
    return await badRequest(event, 'AGREEMENT_COMMITMENT_LINES_REQUIRED', 'apiErrors.request.invalid_status')
  }

  const comments = input.comments ?? ''
  let freshAuthUserId: string | null = null

  const completionResult = await executeFreshAuthorizedAgreementWrite(event, db, context.agreementId, agreementContext, async (trx, currentContext) => {
    await lockAgreementCommitmentEditable(event, trx, context.agreementId, commitmentId)

    const lockedCompletion = await resolveCompletionEvidenceId(trx, 'fundingcaseagreementcommitment', commitmentId)
    if (lockedCompletion) {
      return await badRequest(event, 'AGREEMENT_COMMITMENT_ALREADY_COMPLETED', 'apiErrors.request.invalid_status')
    }

    const lockedLineCount = await trx
      .selectFrom('Funding_Case_Agreement_Commitment_Line')
      .select(({ fn }) => fn.count('id').as('total'))
      .where('egcs_fc_commitment', '=', commitmentId)
      .where('_deleted', '=', false)
      .executeTakeFirst()
    if (Number(lockedLineCount?.total ?? 0) === 0) {
      return await badRequest(event, 'AGREEMENT_COMMITMENT_LINES_REQUIRED', 'apiErrors.request.invalid_status')
    }

    if (!freshAuthUserId) {
      return await notFound(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')
    }
    const currentCommonUser = await resolveFreshCurrentCommonUser(trx, freshAuthUserId)
    if (!currentCommonUser) {
      return await notFound(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')
    }

    const { completion: createdCompletion } = await createCompletionTransition(
      event,
      trx,
      'fundingcaseagreementcommitment',
      commitmentId,
      {
        comments,
        initiatedBy: currentCommonUser.id
      }
    )

    const completionHookPayload: CompletionHookPayload = {
      completionId: createdCompletion.id,
      entityType: 'fundingcaseagreementcommitment',
      entityId: commitmentId,
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

    return {
      hookPayload: completionHookPayload,
      completedByUserName: currentCommonUser.name
    }
  }, {
    businessStatusMode: 'engine',
    businessStatusTarget: { entityType: 'fundingcaseagreementcommitment', entityId: commitmentId },
    authorize: async (trx, _currentContext, authContext) => {
      await lockAgreementCommitmentEditable(event, trx, context.agreementId, commitmentId)
      await authorizeFreshAssignedItem(event, trx, authContext, 'fundingcaseagreementcommitment', commitmentId)
      freshAuthUserId = authContext.userId
    }
  })

  await emitCompletionHook(completionResult.hookPayload)

  return {
    item: {
      id: completionResult.hookPayload.completionId,
      egcs_cn_comments: completionResult.hookPayload.comments,
      egcs_cn_user: completionResult.hookPayload.completedByUserId,
      egcs_cn_user_name: completionResult.completedByUserName,
      egcs_cn_completedat: completionResult.hookPayload.completedAt
    },
    can_complete: false
  }
}
