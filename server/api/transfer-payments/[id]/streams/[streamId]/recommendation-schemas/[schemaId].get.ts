import { authorize } from '~~/server/utils/authorize'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { buildRecommendationSchemaDefinition } from '~~/server/utils/recommendation-setup-versioning'
import { readPublicationMetadata } from '~~/server/utils/system-publication'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  const schemaId = getRouterParam(event, 'schemaId')
  if (!profileId || !streamId || !schemaId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  if (!isPositivePostgresBigintText(schemaId)) return await notFound(event, 'RECOMMENDATION_SCHEMA_NOT_FOUND', 'apiErrors.transfer_payment.recommendation_schema_not_found')

  const context = await authorizeTransferPaymentStreamResource(event, 'read', profileId, streamId)
  if (!context) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  await authorize(event, 'transfer_payment', 'read', createTransferPaymentScopedAuthorizeHandler('read', context.scope, db))

  return await db.transaction().setIsolationLevel('repeatable read').execute(async trx => {
    const schema = await trx.selectFrom('Common_Recommendation_Schema').selectAll()
      .where('id', '=', schemaId)
      .where('egcs_cn_agency', '=', context.agencyId)
      .where('_deleted', '=', false)
      .executeTakeFirst()
    if (!schema) return await notFound(event, 'RECOMMENDATION_SCHEMA_NOT_FOUND', 'apiErrors.transfer_payment.recommendation_schema_not_found')
    const metadata = await readPublicationMetadata(trx, schemaId, buildRecommendationSchemaDefinition(schema))
    return { ...schema, id: String(schema.id), egcs_cn_agency: String(schema.egcs_cn_agency), ...metadata }
  })
})
