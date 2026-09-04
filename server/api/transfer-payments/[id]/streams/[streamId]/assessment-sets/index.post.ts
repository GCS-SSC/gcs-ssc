import { TransferPaymentAssessmentSetCreateSchema } from '~~/shared/types/schemas'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { validateApprovalTemplateForScope } from '~~/server/utils/transfer-payment-polymorphic'
import { authorizeTransferPaymentStreamResource } from '~~/server/utils/transfer-payment-route-authorization'
import {
  authorizeTransferPaymentStreamAction
} from '~~/server/utils/transfer-payment-assessment-sets'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'
import { readReviewSetupPublicationMetadata } from '~~/server/utils/review-setup-versioning'
import { supportsDirectReviewConfiguration } from '~~/server/utils/entity-type-registry'

// eslint-disable-next-line local/require-authorize -- authorization is enforced by authorizeTransferPaymentStreamAction inside the handler.
export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')

  if (!profileId || !streamId) {
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  }

  const streamContext = await authorizeTransferPaymentStreamResource(event, 'create', profileId, streamId)
  if (!streamContext) {
    return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }

  await authorizeTransferPaymentStreamAction(event, 'create', streamContext, db)

  const body = await readValidatedBodyI18n(event, TransferPaymentAssessmentSetCreateSchema)
  return await executeFreshAuthorizedTransferPaymentStreamWrite(
    event,
    db,
    profileId,
    streamContext.agencyId,
    streamId,
    'create',
    async trx => {
      if (!await supportsDirectReviewConfiguration(trx, body.egcs_cn_entitytype)) {
        return await badRequest(event, 'UNSUPPORTED_REVIEW_ENTITY_TYPE', 'apiErrors.request.invalid')
      }
      const hasValidApprovalTemplate = await validateApprovalTemplateForScope(
        trx,
        streamId,
        body.egcs_cn_approvaltemplate
      )

      if (!hasValidApprovalTemplate) {
        return await badRequest(event, 'APPROVAL_TEMPLATE_NOT_FOUND', 'apiErrors.transfer_payment.approval_template_not_found')
      }

      const created = await trx
        .insertInto('Common_Review_Set_Setup')
        .values({
          egcs_cn_scopetype: 'transferpaymentstream',
          egcs_cn_scopeid: streamId,
          egcs_cn_entitytype: body.egcs_cn_entitytype,
          egcs_cn_name_en: body.egcs_cn_name_en,
          egcs_cn_name_fr: body.egcs_cn_name_fr,
          egcs_cn_description_en: body.egcs_cn_description_en,
          egcs_cn_description_fr: body.egcs_cn_description_fr,
          egcs_cn_order: body.egcs_cn_order,
          egcs_cn_sequential: body.egcs_cn_sequential,
          egcs_cn_approvaltemplate: body.egcs_cn_approvaltemplate,
          _deleted: false
        })
        .returningAll()
        .executeTakeFirstOrThrow()

      return {
        id: String(created.id),
        egcs_cn_entitytype: created.egcs_cn_entitytype,
        egcs_cn_name_en: created.egcs_cn_name_en,
        egcs_cn_name_fr: created.egcs_cn_name_fr,
        egcs_cn_description_en: created.egcs_cn_description_en,
        egcs_cn_description_fr: created.egcs_cn_description_fr,
        egcs_cn_order: created.egcs_cn_order,
        egcs_cn_sequential: created.egcs_cn_sequential,
        egcs_cn_approvaltemplate: created.egcs_cn_approvaltemplate ? String(created.egcs_cn_approvaltemplate) : undefined,
        _deleted: created._deleted,
        assessment_count: 0,
        ...await readReviewSetupPublicationMetadata(trx, created)
      }
    }
  )
})
