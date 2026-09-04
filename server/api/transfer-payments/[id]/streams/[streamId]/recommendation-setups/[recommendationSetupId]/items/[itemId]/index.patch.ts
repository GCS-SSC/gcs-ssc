import { TransferPaymentStreamRecommendationSetupMemberPatchSchema } from '~~/shared/types/schemas'
import { authorize } from '~~/server/utils/authorize'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { validateApprovalTemplateForScope, validateRecommendationSchemasForAgency } from '~~/server/utils/transfer-payment-polymorphic'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { isUniqueConstraintError } from '~~/server/utils/postgres-errors'
import { lockRecommendationSetupForMutation } from '~~/server/utils/recommendation-setup-versioning'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  const setupId = getRouterParam(event, 'recommendationSetupId')
  const itemId = getRouterParam(event, 'itemId')
  if (!profileId || !streamId || !setupId || !itemId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  if (!isPositivePostgresBigintText(setupId) || !isPositivePostgresBigintText(itemId)) return await notFound(event, 'RECOMMENDATION_SETUP_MEMBER_NOT_FOUND', 'apiErrors.transfer_payment.recommendation_schema_not_found')
  const context = await authorizeTransferPaymentStreamResource(event, 'update', profileId, streamId)
  if (!context) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  await authorize(event, 'transfer_payment', 'update', createTransferPaymentScopedAuthorizeHandler('update', context.scope, db))
  const body = await readValidatedBodyI18n(event, TransferPaymentStreamRecommendationSetupMemberPatchSchema)
  if (Object.keys(body).length === 0) return await badRequest(event, 'EMPTY_UPDATE', 'apiErrors.request.invalid_resource')
  if ('_deleted' in body && body._deleted !== undefined) return await badRequest(event, 'INVALID_UPDATE', 'apiErrors.request.invalid_resource')
  try {
    return await executeFreshAuthorizedTransferPaymentStreamWrite(
      event, db, profileId, context.agencyId, streamId, 'update', async (trx, freshContext) => {
        const parent = await lockRecommendationSetupForMutation(trx, setupId, streamId)
        if (!parent) return await notFound(event, 'RECOMMENDATION_SETUP_NOT_FOUND', 'apiErrors.transfer_payment.recommendation_setup_not_found')
        if (parent.publicationState === 'retired') {
          return await throwApiError(event, {
            statusCode: 409, code: 'PUBLICATION_RETIRED', key: 'apiErrors.request.invalid_status'
          })
        }
        if (body.egcs_cn_recommendationschema && !await validateRecommendationSchemasForAgency(trx, freshContext.agencyId, [String(body.egcs_cn_recommendationschema)])) {
          return await badRequest(event, 'RECOMMENDATION_SCHEMA_NOT_FOUND', 'apiErrors.transfer_payment.recommendation_schema_not_found')
        }
        if (body.egcs_cn_approvaltemplate && !await validateApprovalTemplateForScope(trx, streamId, String(body.egcs_cn_approvaltemplate))) {
          return await badRequest(event, 'APPROVAL_TEMPLATE_NOT_FOUND', 'apiErrors.transfer_payment.approval_template_not_found')
        }
        const updated = await trx.updateTable('Common_Recommendation_Setup').set(body).where('id', '=', itemId)
          .where('egcs_cn_recommendationset', '=', setupId).where('_deleted', '=', false).returningAll().executeTakeFirst()
        if (!updated) return await notFound(event, 'RECOMMENDATION_SETUP_MEMBER_NOT_FOUND', 'apiErrors.transfer_payment.recommendation_schema_not_found')
        return { ...updated, id: String(updated.id), egcs_cn_recommendationschema: String(updated.egcs_cn_recommendationschema) }
      }
    )
  } catch (error) {
    const constraint = error && typeof error === 'object' && 'constraint' in error ? String(error.constraint) : ''
    if (isUniqueConstraintError(error) && constraint === 'cn_idx_recommendationsetupsetorder') {
      return await badRequest(event, 'DUPLICATE_RECOMMENDATION_SETUP_ORDER', 'apiErrors.transfer_payment.duplicate_recommendation_setup_order')
    }
    if (isUniqueConstraintError(error) && constraint === 'cn_idx_recommendationsetupschema') {
      return await badRequest(event, 'DUPLICATE_RECOMMENDATION_SETUP_SCHEMA', 'apiErrors.transfer_payment.duplicate_recommendation_setup_schema')
    }
    throw error
  }
})
