/* eslint-disable jsdoc/require-jsdoc -- Existing helpers use descriptive names and narrow types. */
import type { H3Event } from 'h3'
import type { Transaction } from 'kysely'
import {
  badRequest,
  notFound
} from '~~/server/utils/api-errors'
import {
  lockAgreementMonitorEditable,
  resolveAgreementMonitorRuntimeContext
} from '~~/server/utils/agreement-monitor'
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

export const getAgreementMonitorCompletionRuntime = async (
  event: H3Event,
  monitorId: string
) => {
  return await executeFreshReadSnapshot(event, async trx => {
    const context = await resolveAgreementMonitorRuntimeContext(trx, monitorId)
    if (!context) return null
    const item = await resolveCompletionRecord(trx, 'fundingcasemonitor', monitorId)
    const protection = await resolveBusinessStatusProtection(trx, 'fundingcasemonitor', monitorId)
    const line = await trx.selectFrom('Funding_Case_Agreement_Monitor_Items')
      .select('id').where('egcs_fc_fundingagreementmonitor', '=', monitorId).where('_deleted', '=', false).executeTakeFirst()

    return {
      item,
      can_complete: item === null
        && Boolean(line)
        && Boolean(protection && !protection.locked),
      blocker: item ? null : !line ? 'lines_required' as const : !protection || protection.locked ? 'business_status' as const : null
    }
  })
}

export const executeAgreementMonitorCompletion = async (
  event: H3Event,
  input: CompletionExecuteInput
) => {
  const db = event.context.$db
  const monitorId = input.entityId
  const context = await resolveAgreementMonitorRuntimeContext(db, monitorId)
  if (!context) {
    return null
  }
  const agreementContext = await resolveAgreementScopeContext(context.agreementId, db)
  if (!agreementContext) {
    return null
  }

  const monitor = await db
    .selectFrom('Funding_Case_Agreement_Monitor')
    .select([
      'id',
      'egcs_fc_status'
    ])
    .where('id', '=', monitorId)
    .where('_deleted', '=', false)
    .executeTakeFirst()

  if (!monitor) {
    return await notFound(event, 'AGREEMENT_MONITOR_NOT_FOUND', 'apiErrors.agreement.monitor_not_found')
  }

  const protection = await resolveBusinessStatusProtection(db, 'fundingcasemonitor', monitorId)
  if (!protection || protection.locked) {
    return await badRequest(event, 'AGREEMENT_MONITOR_LOCKED', 'apiErrors.request.invalid_status')
  }

  const existingCompletion = await resolveCompletionEvidenceId(db, 'fundingcasemonitor', monitorId)
  if (existingCompletion) {
    return await badRequest(event, 'AGREEMENT_MONITOR_ALREADY_COMPLETED', 'apiErrors.request.invalid_status')
  }

  const lineCount = await db
    .selectFrom('Funding_Case_Agreement_Monitor_Items')
    .select(({ fn }) => fn.count('id').as('total'))
    .where('egcs_fc_fundingagreementmonitor', '=', monitorId)
    .where('_deleted', '=', false)
    .executeTakeFirst()

  if (Number(lineCount?.total ?? 0) === 0) {
    return await badRequest(event, 'AGREEMENT_MONITOR_LINES_REQUIRED', 'apiErrors.request.invalid_status')
  }

  const comments = input.comments ?? ''
  let freshAuthUserId: string | null = null

  const completionResult = await executeFreshAuthorizedAgreementWrite(event, db, context.agreementId, agreementContext, async (trx, currentContext) => {
    await lockAgreementMonitorEditable(event, trx, context.agreementId, monitorId)

    const lockedCompletion = await resolveCompletionEvidenceId(trx, 'fundingcasemonitor', monitorId)
    if (lockedCompletion) {
      return await badRequest(event, 'AGREEMENT_MONITOR_ALREADY_COMPLETED', 'apiErrors.request.invalid_status')
    }

    const lockedLineCount = await trx
      .selectFrom('Funding_Case_Agreement_Monitor_Items')
      .select(({ fn }) => fn.count('id').as('total'))
      .where('egcs_fc_fundingagreementmonitor', '=', monitorId)
      .where('_deleted', '=', false)
      .executeTakeFirst()
    if (Number(lockedLineCount?.total ?? 0) === 0) {
      return await badRequest(event, 'AGREEMENT_MONITOR_LINES_REQUIRED', 'apiErrors.request.invalid_status')
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
      'fundingcasemonitor',
      monitorId,
      {
        comments,
        initiatedBy: currentCommonUser.id
      }
    )

    const completionHookPayload: CompletionHookPayload = {
      completionId: createdCompletion.id,
      entityType: 'fundingcasemonitor',
      entityId: monitorId,
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
    businessStatusTarget: { entityType: 'fundingcasemonitor', entityId: monitorId },
    authorize: async (trx, _currentContext, authContext) => {
      await lockAgreementMonitorEditable(event, trx, context.agreementId, monitorId)
      await authorizeFreshAssignedItem(event, trx, authContext, 'fundingcasemonitor', monitorId)
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
