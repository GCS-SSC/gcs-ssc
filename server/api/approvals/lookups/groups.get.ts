import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { ApprovalRuntimeQuerySchema } from '~~/shared/types/schemas/review-approval'
import { requireAuthContext } from '~~/server/utils/authorize'
import { resolveApprovalRuntimeEntityFromEntity, resolveApprovalRuntimeAgencyProjection } from '~~/server/utils/approval-runtime'
import { authorizeReviewRuntimeAction, canAuthorizeReviewRuntimeAction } from '~~/server/utils/review-runtime-access'
import { canCurrentUserAddApprovalStep } from '~~/server/utils/approval-runtime-common'
import { forbidden, notFound } from '~~/server/utils/api-errors'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const { entityType, entityId } = await getValidatedQueryI18n(event, ApprovalRuntimeQuerySchema)
  const runtime = await resolveApprovalRuntimeEntityFromEntity(event.context.$db, entityType, entityId)
  if (!runtime) return await notFound(event, 'APPROVAL_RUNTIME_NOT_FOUND', 'apiErrors.admin_common.not_found')
  const projected = await resolveApprovalRuntimeAgencyProjection(event, runtime)
  if (!projected?.schemaAgencyId) return await notFound(event, 'APPROVAL_RUNTIME_NOT_FOUND', 'apiErrors.admin_common.not_found')
  await authorizeReviewRuntimeAction(event, 'read_review_approval', projected)
  const canManage = await canAuthorizeReviewRuntimeAction(event, 'manage_review_approval', projected)
  if (!canManage && !await canCurrentUserAddApprovalStep(event, entityType, entityId)) return await forbidden(event)
  const groups = await event.context.$db.selectFrom('Common_Group')
    .select(['id', 'egcs_cn_name_en', 'egcs_cn_name_fr'])
    .where('egcs_cn_agency', '=', projected.schemaAgencyId)
    .where('_deleted', '=', false).orderBy('egcs_cn_name_en').execute()
  return { items: groups.map(group => ({ ...group, id: String(group.id) })) }
})
