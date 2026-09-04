import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import {
  assertDirectApprovalRuntimeEntitySupported,
  listApprovalRuntime,
  resolveApprovalRuntimeEntityFromEntity,
  respondApprovalRuntimeEntityNotFound
} from '~~/server/utils/approval-runtime'
import {
  authorizeReviewRuntimeAction,
  canAuthorizeReviewRuntimeAction
} from '~~/server/utils/review-runtime-access'
import { ApprovalRuntimeQuerySchema } from '~~/shared/types/schemas/review-approval'
import { requireAuthContext } from '~~/server/utils/authorize'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const { entityType, entityId } = await getValidatedQueryI18n(event, ApprovalRuntimeQuerySchema)
  const unsupportedEntityResult = await assertDirectApprovalRuntimeEntitySupported(event, entityType)

  if (unsupportedEntityResult) {
    return unsupportedEntityResult
  }

  const runtimeEntity = await resolveApprovalRuntimeEntityFromEntity(event.context.$db, entityType, entityId)
  if (!runtimeEntity) {
    return await respondApprovalRuntimeEntityNotFound(event, entityType)
  }

  await authorizeReviewRuntimeAction(event, 'read_review_approval', runtimeEntity)
  const canManage = await canAuthorizeReviewRuntimeAction(event, 'manage_review_approval', runtimeEntity)
  const runtime = await listApprovalRuntime(event, entityType, entityId, { canManage })

  if (!runtime) {
    return await respondApprovalRuntimeEntityNotFound(event, entityType)
  }

  return runtime
})
