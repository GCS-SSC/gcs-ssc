import { authorizeTransferPaymentStreamResource } from '~~/server/utils/transfer-payment-route-authorization'
import { authorizeTransferPaymentStreamAction } from '~~/server/utils/transfer-payment-assessment-sets'
import { fetchChecklistReviewSchemaForAgency, mapChecklistSchema } from '~~/server/utils/transfer-payment-checklist-schemas'

// Authorization is enforced by authorizeTransferPaymentStreamAction, which wraps authorize().
// eslint-disable-next-line local/require-authorize
export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  const schemaId = getRouterParam(event, 'schemaId')
  if (!profileId || !streamId || !schemaId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  const streamContext = await authorizeTransferPaymentStreamResource(event, 'read', profileId, streamId)
  if (!streamContext) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  await authorizeTransferPaymentStreamAction(event, 'read', streamContext, db)
  return await db.transaction().setIsolationLevel('repeatable read').execute(async trx => {
    const schema = await fetchChecklistReviewSchemaForAgency(trx, streamContext.agencyId, schemaId)
    if (!schema) return await notFound(event, 'CHECKLIST_SCHEMA_NOT_FOUND', 'apiErrors.transfer_payment.review_schema_not_found')
    return await mapChecklistSchema(trx, schema)
  })
})
