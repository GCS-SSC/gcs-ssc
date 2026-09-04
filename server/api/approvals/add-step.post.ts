import { badRequest } from '~~/server/utils/api-errors'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import {
  assertDirectApprovalRuntimeEntitySupported,
  resolveApprovalRuntimeEntityFromEntity,
  respondApprovalRuntimeEntityNotFound
} from '~~/server/utils/approval-runtime'
import { addRuntimeApprovalStep } from '~~/server/utils/approval-runtime-common'
import {
  authorizeReviewRuntimeAction,
  executeFreshAuthorizedApprovalAddStepWrite
} from '~~/server/utils/review-runtime-access'
import { AddApprovalStepSchema } from '~~/shared/types/schemas/review-approval'
import { requireAuthContext } from '~~/server/utils/authorize'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const body = await readValidatedBodyI18n(event, AddApprovalStepSchema)
  const unsupportedEntityResult = await assertDirectApprovalRuntimeEntitySupported(event, body.entityType)
  if (unsupportedEntityResult) return unsupportedEntityResult

  const runtimeEntity = await resolveApprovalRuntimeEntityFromEntity(event.context.$db, body.entityType, body.entityId)
  if (!runtimeEntity) {
    return await respondApprovalRuntimeEntityNotFound(event, body.entityType)
  }

  await authorizeReviewRuntimeAction(event, 'read_review_approval', runtimeEntity)
  return await executeFreshAuthorizedApprovalAddStepWrite(
    event,
    runtimeEntity,
    async (trx, freshRuntimeEntity, { canManage }) => {
      if (!freshRuntimeEntity.schemaAgencyId) {
        return await badRequest(event, 'APPROVAL_AGENCY_NOT_FOUND', 'apiErrors.request.invalid')
      }

      return await addRuntimeApprovalStep(
        event,
        trx,
        body,
        freshRuntimeEntity.schemaAgencyId,
        canManage
      )
    }
  )
})
