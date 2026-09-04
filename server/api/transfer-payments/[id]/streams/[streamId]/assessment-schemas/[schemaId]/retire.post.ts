import { resolveCurrentCommonUser } from '~~/server/utils/additional-reviewer-runtime'
import { authorizeTransferPaymentStreamResource } from '~~/server/utils/transfer-payment-route-authorization'
import {
  authorizeTransferPaymentStreamAction,
  fetchAssessmentReviewSchemaForAgency
} from '~~/server/utils/transfer-payment-assessment-sets'
import { retirePublication } from '~~/server/utils/system-publication'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'

// Authorization is enforced by authorizeTransferPaymentStreamAction, which wraps authorize().
// eslint-disable-next-line local/require-authorize
export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  const schemaId = getRouterParam(event, 'schemaId')
  if (!profileId || !streamId || !schemaId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  const context = await authorizeTransferPaymentStreamResource(event, 'update', profileId, streamId)
  if (!context) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  await authorizeTransferPaymentStreamAction(event, 'update', context, db)
  return await executeFreshAuthorizedTransferPaymentStreamWrite(
    event, db, profileId, context.agencyId, streamId, 'update', async (trx, freshContext) => {
      const schema = await fetchAssessmentReviewSchemaForAgency(trx, freshContext.agencyId, schemaId, true)
      if (!schema) return await notFound(event, 'ASSESSMENT_SCHEMA_NOT_FOUND', 'apiErrors.transfer_payment.review_schema_not_found')
      const actor = await resolveCurrentCommonUser(event, trx)
      if (!actor) return await notFound(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')
      return await retirePublication(trx, { publicationId: schemaId, kind: 'review_schema', actorId: actor.id })
    }
  )
})
