import { CommonRecommendationSchemaCreateSchema } from '~~/shared/types/schemas'
import { authorize } from '~~/server/utils/authorize'
import { createTransferPaymentScopedAuthorizeHandler, authorizeTransferPaymentStreamResource } from '~~/server/utils/transfer-payment-route-authorization'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'
import { buildRecommendationSchemaDefinition } from '~~/server/utils/recommendation-setup-versioning'
import { readPublicationMetadata } from '~~/server/utils/system-publication'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  if (!profileId || !streamId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')

  const streamContext = await authorizeTransferPaymentStreamResource(event, 'create', profileId, streamId)
  if (!streamContext) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  await authorize(event, 'transfer_payment', 'create', createTransferPaymentScopedAuthorizeHandler('create', streamContext.scope, db))

  const body = await readValidatedBodyI18n(event, CommonRecommendationSchemaCreateSchema)
  return await executeFreshAuthorizedTransferPaymentStreamWrite(
    event, db, profileId, streamContext.agencyId, streamId, 'create', async (trx, freshContext) => {
      if (String(body.egcs_cn_agency) !== freshContext.agencyId) {
        return await badRequest(event, 'RECOMMENDATION_SCHEMA_SCOPE_MISMATCH', 'apiErrors.request.invalid_resource')
      }
      const created = await trx.insertInto('Common_Recommendation_Schema')
        .values(body)
        .returningAll()
        .executeTakeFirstOrThrow()
      const metadata = await readPublicationMetadata(
        trx,
        String(created.id),
        buildRecommendationSchemaDefinition(created)
      )
      return { ...created, id: String(created.id), egcs_cn_agency: String(created.egcs_cn_agency), ...metadata }
    }
  )
})
