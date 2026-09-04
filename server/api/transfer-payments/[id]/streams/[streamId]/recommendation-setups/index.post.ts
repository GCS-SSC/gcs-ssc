import { TransferPaymentStreamRecommendationSetupCreateSchema } from '~~/shared/types/schemas'
import { authorize } from '~~/server/utils/authorize'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { validateApprovalTemplateForScope, validateRecommendationSchemasForAgency } from '~~/server/utils/transfer-payment-polymorphic'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  if (!profileId || !streamId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')

  const streamContext = await authorizeTransferPaymentStreamResource(event, 'create', profileId, streamId)
  if (!streamContext) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  await authorize(event, 'transfer_payment', 'create', createTransferPaymentScopedAuthorizeHandler('create', streamContext.scope, db))

  const body = await readValidatedBodyI18n(event, TransferPaymentStreamRecommendationSetupCreateSchema)
  const schemaIds = body.members.map(member => String(member.egcs_cn_recommendationschema))
  const approvalTemplateIds = [
    body.egcs_cn_approvaltemplate,
    ...body.members.map(member => member.egcs_cn_approvaltemplate)
  ]
    .filter((value): value is string => value !== undefined)
  return await executeFreshAuthorizedTransferPaymentStreamWrite(
    event, db, profileId, streamContext.agencyId, streamId, 'create', async (trx, freshContext) => {
      if (!await validateRecommendationSchemasForAgency(trx, freshContext.agencyId, schemaIds, { forUpdate: true })) {
        return await badRequest(event, 'RECOMMENDATION_SCHEMA_NOT_FOUND', 'apiErrors.transfer_payment.recommendation_schema_not_found')
      }
      for (const approvalTemplateId of approvalTemplateIds) {
        if (!await validateApprovalTemplateForScope(trx, streamId, String(approvalTemplateId), { forUpdate: true })) {
          return await badRequest(event, 'APPROVAL_TEMPLATE_NOT_FOUND', 'apiErrors.transfer_payment.approval_template_not_found')
        }
      }
      const created = await trx.insertInto('Common_Recommendation_Set_Setup').values({
        egcs_cn_scopetype: 'transferpaymentstream',
        egcs_cn_scopeid: streamId,
        egcs_cn_name_en: body.egcs_cn_name_en,
        egcs_cn_name_fr: body.egcs_cn_name_fr,
        egcs_cn_description_en: body.egcs_cn_description_en,
        egcs_cn_description_fr: body.egcs_cn_description_fr,
        egcs_cn_approvaltemplate: body.egcs_cn_approvaltemplate,
        _deleted: false
      }).returningAll().executeTakeFirstOrThrow()
      const members = body.members.length === 0
        ? []
        : await trx.insertInto('Common_Recommendation_Setup').values(
            body.members.map(member => ({
              egcs_cn_order: member.egcs_cn_order,
              egcs_cn_recommendationset: String(created.id),
              egcs_cn_approvaltemplate: member.egcs_cn_approvaltemplate,
              egcs_cn_recommendationschema: member.egcs_cn_recommendationschema,
              egcs_cn_failonnotrecommended: member.egcs_cn_failonnotrecommended,
              _deleted: false
            }))
          ).returningAll().execute()

      return {
        ...created,
        id: String(created.id),
        egcs_cn_approvaltemplate: created.egcs_cn_approvaltemplate
          ? String(created.egcs_cn_approvaltemplate)
          : undefined,
        publicationId: String(created.id),
        publicationState: 'draft' as const,
        publicationVersionId: null,
        publicationVersion: null,
        hasUnpublishedChanges: true,
        members: members.map(member => ({
          ...member,
          id: String(member.id),
          egcs_cn_recommendationset: String(member.egcs_cn_recommendationset),
          egcs_cn_recommendationschema: String(member.egcs_cn_recommendationschema)
        }))
      }
    }
  )
})
