import { TransferPaymentStreamRecommendationSetupMemberCreateSchema } from '~~/shared/types/schemas'
import { authorize } from '~~/server/utils/authorize'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { validateApprovalTemplateForScope, validateRecommendationSchemasForAgency } from '~~/server/utils/transfer-payment-polymorphic'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'
import { isUniqueConstraintError } from '~~/server/utils/postgres-errors'
import { lockRecommendationSetupForMutation } from '~~/server/utils/recommendation-setup-versioning'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  const setupId = getRouterParam(event, 'recommendationSetupId')
  if (!profileId || !streamId || !setupId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  if (!isPositivePostgresBigintText(setupId)) return await notFound(event, 'RECOMMENDATION_SETUP_NOT_FOUND', 'apiErrors.transfer_payment.recommendation_setup_not_found')
  const context = await authorizeTransferPaymentStreamResource(event, 'update', profileId, streamId)
  if (!context) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  await authorize(event, 'transfer_payment', 'update', createTransferPaymentScopedAuthorizeHandler('update', context.scope, db))
  const body = await readValidatedBodyI18n(event, TransferPaymentStreamRecommendationSetupMemberCreateSchema)
  let member: unknown
  try {
    member = await executeFreshAuthorizedTransferPaymentStreamWrite(
      event, db, profileId, context.agencyId, streamId, 'update', async (trx, freshContext) => {
        const parent = await lockRecommendationSetupForMutation(trx, setupId, streamId)
        if (!parent) return await notFound(event, 'RECOMMENDATION_SETUP_NOT_FOUND', 'apiErrors.transfer_payment.recommendation_setup_not_found')
        if (parent.publicationState === 'retired') {
          return await throwApiError(event, {
            statusCode: 409, code: 'PUBLICATION_RETIRED', key: 'apiErrors.request.invalid_status'
          })
        }
        if (!await validateRecommendationSchemasForAgency(trx, freshContext.agencyId, [String(body.egcs_cn_recommendationschema)])) {
          return await badRequest(event, 'RECOMMENDATION_SCHEMA_NOT_FOUND', 'apiErrors.transfer_payment.recommendation_schema_not_found')
        }
        if (body.egcs_cn_approvaltemplate && !await validateApprovalTemplateForScope(trx, streamId, String(body.egcs_cn_approvaltemplate))) {
          return await badRequest(event, 'APPROVAL_TEMPLATE_NOT_FOUND', 'apiErrors.transfer_payment.approval_template_not_found')
        }
        return await trx.insertInto('Common_Recommendation_Setup').values({
          egcs_cn_order: body.egcs_cn_order,
          egcs_cn_recommendationset: setupId, egcs_cn_approvaltemplate: body.egcs_cn_approvaltemplate,
          egcs_cn_recommendationschema: body.egcs_cn_recommendationschema,
          egcs_cn_failonnotrecommended: body.egcs_cn_failonnotrecommended, _deleted: false
        }).returningAll().executeTakeFirstOrThrow()
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
  if (!member || typeof member !== 'object' || !('id' in member)) return member
  const persistedMember = member as Record<string, unknown>
  return { ...persistedMember, id: String(persistedMember.id), egcs_cn_recommendationschema: String(persistedMember.egcs_cn_recommendationschema) }
})
