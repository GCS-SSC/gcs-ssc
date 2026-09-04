/* eslint-disable jsdoc/require-jsdoc -- Existing helpers use descriptive names and narrow types. */
import type { H3Event } from 'h3'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { resolveCurrentCommonUser } from '~~/server/utils/additional-reviewer-runtime'
import {
  lockAgreementForecastEditable,
  resolveAgreementForecastRuntimeContext
} from '~~/server/utils/agreement-forecast'
import { createCompletionTransition } from '~~/server/utils/workflow-runtime'
import {
  emitCompletionHook,
  resolveCompletionEvidenceId,
  resolveCompletionRecord
} from '~~/server/utils/completion-runtime-core'
import type { CompletionHookPayload } from '~~/shared/types/completion'
import type { CompletionExecuteInput } from '~~/shared/types/schemas/completion'
import { resolveAgreementScopeContext } from '~~/server/utils/agreement'
import {
  executeFreshAuthorizedAgreementWrite
} from '~~/server/utils/agreement-write-transaction'
import { authorizeFreshAssignedItem } from '~~/server/utils/authorize'
import { resolveBusinessStatusProtection } from '~~/server/utils/business-status-runtime'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'

export const getAgreementForecastCompletionRuntime = async (
  event: H3Event,
  forecastId: string
) => {
  return await executeFreshReadSnapshot(event, async trx => {
    const context = await resolveAgreementForecastRuntimeContext(trx, forecastId)
    if (!context) return null
    const item = await resolveCompletionRecord(trx, 'fundingcaseforecast', forecastId)
    const protection = await resolveBusinessStatusProtection(trx, 'fundingcaseforecast', forecastId)
    const lineItem = await trx.selectFrom('Funding_Case_Agreement_Forecast_Line_Item')
      .select('id').where('egcs_fc_agreementforecast', '=', forecastId).where('_deleted', '=', false).executeTakeFirst()

    return {
      item,
      can_complete: item === null
        && Boolean(lineItem)
        && Boolean(protection && !protection.locked),
      blocker: item ? null : !lineItem ? 'lines_required' as const : !protection || protection.locked ? 'business_status' as const : null
    }
  })
}

export const executeAgreementForecastCompletion = async (
  event: H3Event,
  input: CompletionExecuteInput
) => {
  const db = event.context.$db
  const forecastId = input.entityId
  const context = await resolveAgreementForecastRuntimeContext(db, forecastId)
  if (!context) {
    return null
  }
  const agreementContext = await resolveAgreementScopeContext(context.agreementId, db)
  if (!agreementContext) {
    return null
  }

  const existingCompletion = await resolveCompletionEvidenceId(db, 'fundingcaseforecast', forecastId)
  if (existingCompletion) {
    return await badRequest(event, 'AGREEMENT_FORECAST_ALREADY_COMPLETED', 'apiErrors.request.invalid_status')
  }

  const lineItems = await db
    .selectFrom('Funding_Case_Agreement_Forecast_Line_Item')
    .select('id')
    .where('egcs_fc_agreementforecast', '=', forecastId)
    .where('_deleted', '=', false)
    .execute()

  if (lineItems.length === 0) {
    return await badRequest(event, 'AGREEMENT_FORECAST_LINES_REQUIRED', 'apiErrors.request.invalid_status')
  }

  const protection = await resolveBusinessStatusProtection(db, 'fundingcaseforecast', forecastId)
  if (!protection || protection.locked) {
    return await badRequest(event, 'AGREEMENT_FORECAST_LOCKED', 'apiErrors.request.invalid_status')
  }

  const currentCommonUser = await resolveCurrentCommonUser(event)
  if (!currentCommonUser) {
    return await notFound(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')
  }

  const comments = input.comments ?? ''

  const hookPayload = await executeFreshAuthorizedAgreementWrite(event, db, context.agreementId, agreementContext, async (trx, currentContext) => {
    await lockAgreementForecastEditable(event, trx, context.agreementId, forecastId)
    const currentLineItem = await trx
      .selectFrom('Funding_Case_Agreement_Forecast_Line_Item')
      .select('id')
      .where('egcs_fc_agreementforecast', '=', forecastId)
      .where('_deleted', '=', false)
      .executeTakeFirst()
    if (!currentLineItem) {
      return await badRequest(event, 'AGREEMENT_FORECAST_LINES_REQUIRED', 'apiErrors.request.invalid_status')
    }

    const { completion: createdCompletion } = await createCompletionTransition(
      event,
      trx,
      'fundingcaseforecast',
      forecastId,
      {
        comments,
        initiatedBy: currentCommonUser.id
      }
    )

    const completionHookPayload: CompletionHookPayload = {
      completionId: createdCompletion.id,
      entityType: 'fundingcaseforecast',
      entityId: forecastId,
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
    businessStatusTarget: { entityType: 'fundingcaseforecast', entityId: forecastId },
    authorize: async (trx, _currentContext, authContext) => {
      await lockAgreementForecastEditable(event, trx, context.agreementId, forecastId)
      await authorizeFreshAssignedItem(event, trx, authContext, 'fundingcaseforecast', forecastId)
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
