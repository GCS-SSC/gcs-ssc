import { authorize } from '~~/server/utils/authorize'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'
import { lockRecommendationSetupForMutation } from '~~/server/utils/recommendation-setup-versioning'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  const setupId = getRouterParam(event, 'recommendationSetupId')
  const itemId = getRouterParam(event, 'itemId')
  if (!profileId || !streamId || !setupId || !itemId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  if (!isPositivePostgresBigintText(setupId) || !isPositivePostgresBigintText(itemId)) return await notFound(event, 'RECOMMENDATION_SETUP_MEMBER_NOT_FOUND', 'apiErrors.transfer_payment.recommendation_schema_not_found')
  const context = await authorizeTransferPaymentStreamResource(event, 'delete', profileId, streamId)
  if (!context) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  await authorize(event, 'transfer_payment', 'delete', createTransferPaymentScopedAuthorizeHandler('delete', context.scope, db))
  return await executeFreshAuthorizedTransferPaymentStreamWrite(
    event, db, profileId, context.agencyId, streamId, 'delete', async trx => {
      const parent = await lockRecommendationSetupForMutation(trx, setupId, streamId)
      if (!parent) return await notFound(event, 'RECOMMENDATION_SETUP_NOT_FOUND', 'apiErrors.transfer_payment.recommendation_setup_not_found')
      if (parent.publicationState === 'retired') {
        return await throwApiError(event, {
          statusCode: 409, code: 'PUBLICATION_RETIRED', key: 'apiErrors.request.invalid_status'
        })
      }
      const result = await trx.updateTable('Common_Recommendation_Setup').set({ _deleted: true }).where('id', '=', itemId)
        .where('egcs_cn_recommendationset', '=', setupId).where('_deleted', '=', false).returning('id').executeTakeFirst()
      if (!result) return await notFound(event, 'RECOMMENDATION_SETUP_MEMBER_NOT_FOUND', 'apiErrors.transfer_payment.recommendation_schema_not_found')
      const remainingMembers = await trx.selectFrom('Common_Recommendation_Setup').select('id')
        .where('egcs_cn_recommendationset', '=', setupId).where('_deleted', '=', false)
        .orderBy('egcs_cn_order', 'asc').forUpdate().execute()
      for (const [index, member] of remainingMembers.entries()) {
        await trx.updateTable('Common_Recommendation_Setup').set({ egcs_cn_order: index + 1 })
          .where('id', '=', String(member.id)).execute()
      }
      return { success: true }
    }
  )
})
