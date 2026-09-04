import { TransferPaymentStreamRecommendationSetupSchemaCreateSchema } from '~~/shared/types/schemas'
import { authorize } from '~~/server/utils/authorize'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { validateApprovalTemplateForScope } from '~~/server/utils/transfer-payment-polymorphic'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'
import { isUniqueConstraintError } from '~~/server/utils/postgres-errors'
import { lockRecommendationSetupForMutation } from '~~/server/utils/recommendation-setup-versioning'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

const EMPTY_RECOMMENDATION_DEFINITION = {
  sections: [{
    key: 'recommendation', label: { en: 'Recommendation', fr: 'Recommandation' }, subSections: [{
      key: 'decision', label: { en: 'Decision', fr: 'Décision' }, questions: [{
        key: 'result', type: 'radio' as const, question: { en: 'What is your recommendation?', fr: 'Quelle est votre recommandation?' },
        required: true, isResult: true, options: [
          { key: 'recommended', label: { en: 'Recommended', fr: 'Recommandé' }, outcome: 'recommended' as const },
          { key: 'not-recommended', label: { en: 'Not recommended', fr: 'Non recommandé' }, outcome: 'not_recommended' as const }
        ]
      }]
    }]
  }]
}

export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  const setupId = getRouterParam(event, 'recommendationSetupId')
  if (!profileId || !streamId || !setupId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  if (!isPositivePostgresBigintText(setupId)) return await notFound(event, 'RECOMMENDATION_SETUP_NOT_FOUND', 'apiErrors.transfer_payment.recommendation_setup_not_found')
  const context = await authorizeTransferPaymentStreamResource(event, 'create', profileId, streamId)
  if (!context) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  await authorize(event, 'transfer_payment', 'create', createTransferPaymentScopedAuthorizeHandler('create', context.scope, db))
  const body = await readValidatedBodyI18n(event, TransferPaymentStreamRecommendationSetupSchemaCreateSchema)
  try {
    return await executeFreshAuthorizedTransferPaymentStreamWrite(event, db, profileId, context.agencyId, streamId, 'create', async (trx, freshContext) => {
      const parent = await lockRecommendationSetupForMutation(trx, setupId, streamId)
      if (!parent) return await notFound(event, 'RECOMMENDATION_SETUP_NOT_FOUND', 'apiErrors.transfer_payment.recommendation_setup_not_found')
      if (parent.publicationState === 'retired') {
        return await throwApiError(event, {
          statusCode: 409, code: 'PUBLICATION_RETIRED', key: 'apiErrors.request.invalid_status'
        })
      }
      if (body.egcs_cn_approvaltemplate && !await validateApprovalTemplateForScope(trx, streamId, body.egcs_cn_approvaltemplate)) {
        return await badRequest(event, 'APPROVAL_TEMPLATE_NOT_FOUND', 'apiErrors.transfer_payment.approval_template_not_found')
      }
      const duplicate = await trx.selectFrom('Common_Recommendation_Setup').select('id').where('egcs_cn_recommendationset', '=', setupId)
        .where('egcs_cn_order', '=', body.egcs_cn_order).where('_deleted', '=', false).executeTakeFirst()
      if (duplicate) return await badRequest(event, 'DUPLICATE_RECOMMENDATION_SETUP_ORDER', 'apiErrors.transfer_payment.duplicate_recommendation_setup_order')
      const schemaNameSuffix = `${setupId}-${body.egcs_cn_order}`
      const schema = await trx.insertInto('Common_Recommendation_Schema').values({
        egcs_cn_agency: freshContext.agencyId,
        egcs_cn_name_en: `Untitled recommendation ${schemaNameSuffix}`,
        egcs_cn_name_fr: `Recommandation sans titre ${schemaNameSuffix}`,
        egcs_cn_result: {}, egcs_cn_recommendationschema: EMPTY_RECOMMENDATION_DEFINITION, _deleted: false
      }).returning('id').executeTakeFirstOrThrow()
      await trx.insertInto('Common_Recommendation_Setup').values({
        egcs_cn_order: body.egcs_cn_order, egcs_cn_recommendationset: setupId,
        egcs_cn_approvaltemplate: body.egcs_cn_approvaltemplate, egcs_cn_recommendationschema: String(schema.id),
        egcs_cn_failonnotrecommended: body.egcs_cn_failonnotrecommended, _deleted: false
      }).execute()
      return {
        schemaId: String(schema.id),
        publicationId: String(schema.id),
        publicationState: 'draft' as const,
        publicationVersionId: null,
        publicationVersion: null,
        hasUnpublishedChanges: true
      }
    })
  } catch (error) {
    const constraint = error && typeof error === 'object' && 'constraint' in error ? String(error.constraint) : ''
    if (isUniqueConstraintError(error) && constraint === 'cn_idx_recommendationsetupsetorder') {
      return await badRequest(event, 'DUPLICATE_RECOMMENDATION_SETUP_ORDER', 'apiErrors.transfer_payment.duplicate_recommendation_setup_order')
    }
    throw error
  }
})
