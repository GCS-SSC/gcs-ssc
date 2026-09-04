import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import {
  assertDirectApprovalRuntimeEntitySupported,
  listApprovalLookupBehalfTypesPage,
  resolveApprovalRuntimeAgencyProjection,
  resolveApprovalRuntimeEntityFromEntity,
  respondApprovalRuntimeEntityNotFound
} from '~~/server/utils/approval-runtime'
import { authorizeReviewRuntimeAction } from '~~/server/utils/review-runtime-access'
import { ApprovalRuntimeQuerySchema } from '~~/shared/types/schemas/review-approval'
import { requireAuthContext } from '~~/server/utils/authorize'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const { entityType, entityId, page, limit, search } = await getValidatedQueryI18n(event, ApprovalRuntimeQuerySchema)
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
  const result = await listApprovalLookupBehalfTypesPage(
    event.context.$db,
    projectedRuntimeEntity,
    page,
    limit,
    search
  )

  return {
    items: result.items.map(item => ({
      id: String(item.id),
      egcs_ay_name_en: item.egcs_ay_name_en,
      egcs_ay_name_fr: item.egcs_ay_name_fr,
      egcs_ay_require_actual: item.egcs_ay_require_actual
    })),
    total: result.total,
    stats: {
      total: result.total,
      active: result.total
    },
    page,
    limit
  }
})
