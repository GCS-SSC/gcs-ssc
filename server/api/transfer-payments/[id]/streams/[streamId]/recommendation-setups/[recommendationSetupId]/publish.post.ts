import { authorize } from '~~/server/utils/authorize'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { buildRecommendationPlanPublication, resolvePublicationActorId } from '~~/server/utils/recommendation-setup-versioning'
import { isExpectedPublicationFailure, throwIfPublicationSelectionConflict } from '~~/server/utils/publication-errors'
import { publishDefinition } from '~~/server/utils/system-publication'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'
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
  try {
    return await executeFreshAuthorizedTransferPaymentStreamWrite(
      event, db, profileId, context.agencyId, streamId, 'update', async (trx, _freshContext, authContext) => {
        const setup = await trx.selectFrom('Common_Recommendation_Set_Setup').selectAll().where('id', '=', setupId)
          .where('egcs_cn_scopetype', '=', 'transferpaymentstream').where('egcs_cn_scopeid', '=', streamId)
          .where('_deleted', '=', false).forUpdate().executeTakeFirst()
        if (!setup) return await notFound(event, 'RECOMMENDATION_SETUP_NOT_FOUND', 'apiErrors.transfer_payment.recommendation_setup_not_found')
        const actorId = await resolvePublicationActorId(trx, authContext.userId)
        if (!actorId) return await notFound(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')
        let plan
        try {
          plan = await buildRecommendationPlanPublication(trx, setup)
        } catch (error: unknown) {
          if (!isExpectedPublicationFailure(error)) throw error
          return await badRequest(event, 'RECOMMENDATION_SETUP_INVALID_PUBLICATION', 'apiErrors.request.invalid_resource')
        }
        const publication = await publishDefinition(trx, {
          publicationId: setupId,
          kind: 'recommendation_set_setup',
          definition: plan.definition,
          actorId,
          references: plan.references,
          selections: [{
            dimension: 'scope',
            key: `${setup.egcs_cn_scopetype}:${setup.egcs_cn_scopeid}`
          }]
        })
        const { definition: _definition, hash: _hash, ...metadata } = publication
        return { ...setup, id: String(setup.id), egcs_cn_scopeid: String(setup.egcs_cn_scopeid), ...metadata }
      }
    )
  } catch (error) {
    return await throwIfPublicationSelectionConflict(event, error)
  }
})
