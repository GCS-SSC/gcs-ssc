import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import {
  assertDirectApprovalRuntimeEntitySupported,
  listApprovalLookupUsers,
  resolveApprovalRuntimeAgencyProjection,
  resolveApprovalRuntimeEntityFromEntity,
  respondApprovalRuntimeEntityNotFound
} from '~~/server/utils/approval-runtime'
import {
  authorizeReviewRuntimeAction,
  canAuthorizeReviewRuntimeAction
} from '~~/server/utils/review-runtime-access'
import { canCurrentUserAddApprovalStep } from '~~/server/utils/approval-runtime-common'
import { forbidden } from '~~/server/utils/api-errors'
import { ApprovalRuntimeQuerySchema } from '~~/shared/types/schemas/review-approval'
import { requireAuthContext } from '~~/server/utils/authorize'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const { entityType, entityId, search } = await getValidatedQueryI18n(event, ApprovalRuntimeQuerySchema)
  const unsupportedEntityResult = await assertDirectApprovalRuntimeEntitySupported(event, entityType)

  if (unsupportedEntityResult) {
    return unsupportedEntityResult
  }

  const runtimeEntity = await resolveApprovalRuntimeEntityFromEntity(event.context.$db, entityType, entityId)
  if (!runtimeEntity) {
    return await respondApprovalRuntimeEntityNotFound(event, entityType)
  }
  const projectedRuntimeEntity = await resolveApprovalRuntimeAgencyProjection(event, runtimeEntity)
  if (!projectedRuntimeEntity) {
    return await respondApprovalRuntimeEntityNotFound(event, entityType)
  }

  await authorizeReviewRuntimeAction(event, 'read_review_approval', projectedRuntimeEntity)
  const canManage = await canAuthorizeReviewRuntimeAction(event, 'manage_review_approval', projectedRuntimeEntity)
  const canAdd = canManage || await canCurrentUserAddApprovalStep(event, entityType, entityId)
  if (!canAdd) return await forbidden(event)
  const users = await listApprovalLookupUsers(event.context.$db, projectedRuntimeEntity)
  const searchTerm = search?.trim().toLowerCase() ?? ''
  const items = searchTerm
    ? users.filter(user => user.name.toLowerCase().includes(searchTerm))
    : users

  return {
    items,
    total: items.length,
    stats: {
      total: items.length,
      active: items.length
    },
    page: 1,
    limit: items.length || 1
  }
})
