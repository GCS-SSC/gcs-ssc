import { authorize } from '~~/server/utils/authorize'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { resolvePublicationActorId } from '~~/server/utils/recommendation-setup-versioning'
import { retirePublication } from '~~/server/utils/system-publication'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  const schemaId = getRouterParam(event, 'schemaId')
  if (!profileId || !streamId || !schemaId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  if (!isPositivePostgresBigintText(schemaId)) return await notFound(event, 'RECOMMENDATION_SCHEMA_NOT_FOUND', 'apiErrors.transfer_payment.recommendation_schema_not_found')
  const context = await authorizeTransferPaymentStreamResource(event, 'update', profileId, streamId)
  if (!context) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  await authorize(event, 'transfer_payment', 'update', createTransferPaymentScopedAuthorizeHandler('update', context.scope, db))

  return await executeFreshAuthorizedTransferPaymentStreamWrite(
    event, db, profileId, context.agencyId, streamId, 'update', async (trx, freshContext, authContext) => {
      const schema = await trx.selectFrom('Common_Recommendation_Schema').select(['id', 'egcs_cn_agency'])
        .where('id', '=', schemaId).where('egcs_cn_agency', '=', freshContext.agencyId).where('_deleted', '=', false)
        .forUpdate().executeTakeFirst()
      if (!schema) return await notFound(event, 'RECOMMENDATION_SCHEMA_NOT_FOUND', 'apiErrors.transfer_payment.recommendation_schema_not_found')
      const actorId = await resolvePublicationActorId(trx, authContext.userId)
      if (!actorId) return await notFound(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')
      return await retirePublication(trx, { publicationId: schemaId, kind: 'recommendation_schema', actorId })
    }
  )
})
