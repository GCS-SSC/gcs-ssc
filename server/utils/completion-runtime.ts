/* eslint-disable jsdoc/require-jsdoc */
import type { H3Event } from 'h3'
import type { Kysely } from 'kysely'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import type { CompletionExecuteInput } from '~~/shared/types/schemas/completion'
import type { Database, Entity_Type } from '~~/shared/types/database'
import {
  executeAgreementCommitmentCompletion,
  getAgreementCommitmentCompletionRuntime
} from '~~/server/utils/agreement-commitment-completion'
import {
  executeAgreementForecastCompletion,
  getAgreementForecastCompletionRuntime
} from '~~/server/utils/agreement-forecast-completion'
import {
  executeAgreementMonitorCompletion,
  getAgreementMonitorCompletionRuntime
} from '~~/server/utils/agreement-monitor-completion'
import {
  executeAgreementPaymentCompletion,
  getAgreementPaymentCompletionRuntime
} from '~~/server/utils/agreement-payment-completion'
import {
  executeAgreementClaimReconcileCompletion,
  getAgreementClaimReconcileCompletionRuntime
} from '~~/server/utils/agreement-claim-reconcile-completion'
import {
  executeAgreementClaimCompletion,
  getAgreementClaimCompletionRuntime
} from '~~/server/utils/agreement-claim-completion'
import {
  executeCommonReviewCompletion,
  getCommonReviewCompletionRuntime
} from '~~/server/utils/completion-runtime-commonreview'
import {
  resolveReviewRuntimeEntityFromEntity,
  resolveReviewRuntimeEntityFromReview,
  type ReviewRuntimeEntityContext
} from '~~/server/utils/review-runtime-access'
import {
  executeRequiredWorkflowCompletion,
  getRequiredWorkflowCompletionRuntime
} from './agreement-required-workflow-completion'
import { resolveEntityTypeLifecycleDefinition } from './entity-type-registry'
import { executeExtensionCompletion, getExtensionCompletionRuntime, resolveExtensionLifecycleRuntime } from './extension-lifecycle-runtime'

export const isDirectCompletionRuntimeEntitySupported = (entityType: Entity_Type): boolean =>
  entityType === 'commonreview'
  || entityType === 'fundingcaseagreementclaim'
  || entityType === 'fundingcaseagreementcommitment'
  || entityType === 'fundingcasemonitor'
  || entityType === 'fundingcasepayment'
  || entityType === 'fundingclaimreconcile'
  || entityType === 'fundingcaseforecast'
  || entityType === 'fundingcaseamendment'
  || entityType === 'fundingcaseagreementcloseout'

export const assertDirectCompletionRuntimeEntitySupported = async (
  event: H3Event,
  entityType: Entity_Type
) => {
  const definition = entityType?.includes(':')
    ? await resolveEntityTypeLifecycleDefinition(event.context.$db, entityType)
    : null
  if (isDirectCompletionRuntimeEntitySupported(entityType)
    || definition?.completion === 'supported') {
    return
  }

  return await badRequest(event, 'UNSUPPORTED_COMPLETION_ENTITY_TYPE', 'apiErrors.request.invalid')
}

export const respondCompletionRuntimeEntityNotFound = async (
  event: H3Event,
  entityType: Entity_Type
) => {
  if (entityType === 'commonreview') {
    return await notFound(event, 'ASSESSMENT_NOT_FOUND', 'apiErrors.admin_common.not_found')
  }

  if (entityType === 'fundingcaseagreementcommitment') {
    return await notFound(event, 'AGREEMENT_COMMITMENT_NOT_FOUND', 'apiErrors.agreement.commitment_not_found')
  }

  if (entityType === 'fundingcaseagreementclaim') {
    return await notFound(event, 'AGREEMENT_CLAIM_NOT_FOUND', 'apiErrors.agreement.claim_not_found')
  }

  if (entityType === 'fundingcaseagreement' || entityType === 'fundingcaseamendment' || entityType === 'fundingcaseagreementcloseout') {
    if (entityType === 'fundingcaseagreement') return await notFound(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
    if (entityType === 'fundingcaseamendment') return await notFound(event, 'AGREEMENT_AMENDMENT_NOT_FOUND', 'apiErrors.agreement.amendment_not_found')
    return await notFound(event, 'AGREEMENT_CLOSEOUT_NOT_FOUND', 'apiErrors.agreement.closeout_not_found')
  }

  if (entityType === 'fundingcaseforecast') {
    return await notFound(event, 'AGREEMENT_FORECAST_NOT_FOUND', 'apiErrors.agreement.forecast_not_found')
  }

  if (entityType === 'fundingcasemonitor') {
    return await notFound(event, 'AGREEMENT_MONITOR_NOT_FOUND', 'apiErrors.agreement.monitor_not_found')
  }

  if (entityType === 'fundingcasepayment') {
    return await notFound(event, 'AGREEMENT_PAYMENT_NOT_FOUND', 'apiErrors.agreement.payment_not_found')
  }

  if (entityType === 'fundingclaimreconcile') {
    return await notFound(event, 'AGREEMENT_CLAIM_RECONCILE_NOT_FOUND', 'apiErrors.agreement.claim_reconcile_not_found')
  }

  return await notFound(event, 'COMPLETION_ENTITY_NOT_FOUND', 'apiErrors.admin_common.not_found')
}

export const resolveCompletionRuntimeEntityFromEntity = async (
  db: Kysely<Database>,
  entityType: Entity_Type,
  entityId: string
): Promise<ReviewRuntimeEntityContext | null> => {
  if (entityType === 'commonreview') {
    return await resolveReviewRuntimeEntityFromReview(db, entityId)
  }

  if (entityType === 'fundingcaseagreement' || entityType === 'fundingcaseamendment'
    || entityType === 'fundingcaseagreementclaim') {
    return await resolveReviewRuntimeEntityFromEntity(db, entityType, entityId)
  }

  if (entityType === 'fundingcaseagreementcloseout') {
    return await resolveReviewRuntimeEntityFromEntity(db, entityType, entityId)
  }

  if (entityType === 'fundingcaseagreementcommitment') {
    return await resolveReviewRuntimeEntityFromEntity(db, entityType, entityId)
  }

  if (entityType === 'fundingcaseforecast') {
    return await resolveReviewRuntimeEntityFromEntity(db, entityType, entityId)
  }

  if (entityType === 'fundingcasemonitor') {
    return await resolveReviewRuntimeEntityFromEntity(db, entityType, entityId)
  }

  if (entityType === 'fundingcasepayment') {
    return await resolveReviewRuntimeEntityFromEntity(db, entityType, entityId)
  }

  if (entityType === 'fundingclaimreconcile') {
    return await resolveReviewRuntimeEntityFromEntity(db, entityType, entityId)
  }

  return null
}

export const getCompletionRuntime = async (
  event: H3Event,
  entityType: Entity_Type,
  entityId: string
) => {
  if (entityType?.includes(':')) {
    const runtime = await resolveExtensionLifecycleRuntime(event, entityType, entityId)
    return runtime ? await getExtensionCompletionRuntime(event, runtime) : null
  }
  if (entityType === 'commonreview') {
    return await getCommonReviewCompletionRuntime(event, entityId)
  }

  if (entityType === 'fundingcaseagreementcommitment') {
    return await getAgreementCommitmentCompletionRuntime(event, entityId)
  }

  if (entityType === 'fundingcaseagreementclaim') {
    return await getAgreementClaimCompletionRuntime(event, entityId)
  }

  if (entityType === 'fundingcaseforecast') {
    return await getAgreementForecastCompletionRuntime(event, entityId)
  }

  if (entityType === 'fundingcasemonitor') {
    return await getAgreementMonitorCompletionRuntime(event, entityId)
  }

  if (entityType === 'fundingcasepayment') {
    return await getAgreementPaymentCompletionRuntime(event, entityId)
  }

  if (entityType === 'fundingclaimreconcile') {
    return await getAgreementClaimReconcileCompletionRuntime(event, entityId)
  }

  if (entityType === 'fundingcaseamendment' || entityType === 'fundingcaseagreementcloseout') {
    return await getRequiredWorkflowCompletionRuntime(event, entityType, entityId)
  }

  return null
}

export const executeCompletion = async (
  event: H3Event,
  input: CompletionExecuteInput
) => {
  if (input.entityType?.includes(':')) return await executeExtensionCompletion(event, input)
  if (input.entityType === 'commonreview') {
    return await executeCommonReviewCompletion(event, input)
  }

  if (input.entityType === 'fundingcaseagreementcommitment') {
    return await executeAgreementCommitmentCompletion(event, input)
  }

  if (input.entityType === 'fundingcaseagreementclaim') {
    return await executeAgreementClaimCompletion(event, input)
  }

  if (input.entityType === 'fundingcaseforecast') {
    return await executeAgreementForecastCompletion(event, input)
  }

  if (input.entityType === 'fundingcasemonitor') {
    return await executeAgreementMonitorCompletion(event, input)
  }

  if (input.entityType === 'fundingcasepayment') {
    return await executeAgreementPaymentCompletion(event, input)
  }

  if (input.entityType === 'fundingclaimreconcile') {
    return await executeAgreementClaimReconcileCompletion(event, input)
  }

  if (input.entityType === 'fundingcaseamendment' || input.entityType === 'fundingcaseagreementcloseout') {
    return await executeRequiredWorkflowCompletion(event, input)
  }

  return null
}
