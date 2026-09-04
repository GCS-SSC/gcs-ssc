import { CommonRecommendationSchemaPatchSchema } from '~~/shared/types/schemas'
import { authorize } from '~~/server/utils/authorize'
import { createTransferPaymentScopedAuthorizeHandler, authorizeTransferPaymentStreamResource } from '~~/server/utils/transfer-payment-route-authorization'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'
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

  const streamContext = await authorizeTransferPaymentStreamResource(event, 'update', profileId, streamId)
  if (!streamContext) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  await authorize(event, 'transfer_payment', 'update', createTransferPaymentScopedAuthorizeHandler('update', streamContext.scope, db))

  const body = await readValidatedBodyI18n(event, CommonRecommendationSchemaPatchSchema)
  const { _deleted: _ignoredDeleted, ...schemaValues } = body
  if (Object.keys(schemaValues).length === 0) return await badRequest(event, 'EMPTY_UPDATE', 'apiErrors.request.invalid_resource')
  return await executeFreshAuthorizedTransferPaymentStreamWrite(
    event, db, profileId, streamContext.agencyId, streamId, 'update', async (trx, freshContext) => {
      if (body.egcs_cn_agency !== undefined && String(body.egcs_cn_agency) !== freshContext.agencyId) {
        return await badRequest(event, 'RECOMMENDATION_SCHEMA_SCOPE_MISMATCH', 'apiErrors.request.invalid_resource')
      }
      const existing = await trx.selectFrom('Common_Recommendation_Schema')
        .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Recommendation_Schema.id')
        .select('Common_Publication.egcs_cn_state as publication_state')
        .where('Common_Recommendation_Schema.id', '=', schemaId)
        .where('Common_Recommendation_Schema.egcs_cn_agency', '=', freshContext.agencyId)
        .where('Common_Recommendation_Schema._deleted', '=', false)
        .where('Common_Publication._deleted', '=', false)
        .forUpdate(['Common_Recommendation_Schema', 'Common_Publication'])
        .executeTakeFirst()
      if (!existing) return await notFound(event, 'RECOMMENDATION_SCHEMA_NOT_FOUND', 'apiErrors.transfer_payment.recommendation_schema_not_found')
      if (existing.publication_state === 'retired') {
        return await throwApiError(event, {
          statusCode: 409, code: 'PUBLICATION_RETIRED', key: 'apiErrors.request.invalid_status'
        })
      }
      const updated = await trx.updateTable('Common_Recommendation_Schema')
        .set(schemaValues)
        .where('id', '=', schemaId)
        .where('egcs_cn_agency', '=', freshContext.agencyId)
        .where('_deleted', '=', false)
        .returningAll()
        .executeTakeFirst()
      if (!updated) return await notFound(event, 'RECOMMENDATION_SCHEMA_NOT_FOUND', 'apiErrors.transfer_payment.recommendation_schema_not_found')
      const metadata = await readPublicationMetadata(trx, schemaId, buildRecommendationSchemaDefinition(updated))
      return { ...updated, id: String(updated.id), egcs_cn_agency: String(updated.egcs_cn_agency), ...metadata }
    }
  )
})
