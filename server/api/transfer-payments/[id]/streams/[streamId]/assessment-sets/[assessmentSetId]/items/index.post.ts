import { TransferPaymentAssessmentSetItemCreateSchema } from '~~/shared/types/schemas'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { validateApprovalTemplateForScope } from '~~/server/utils/transfer-payment-polymorphic'
import { authorizeTransferPaymentStreamResource } from '~~/server/utils/transfer-payment-route-authorization'
import {
  authorizeTransferPaymentStreamAction,
  fetchAssessmentSetForStream,
  validateAssessmentReviewSchemasForAgency
} from '~~/server/utils/transfer-payment-assessment-sets'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

// Authorization is enforced by authorizeTransferPaymentStreamAction, which wraps authorize().
// eslint-disable-next-line local/require-authorize
export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  const assessmentSetId = getRouterParam(event, 'assessmentSetId')

  if (!profileId || !streamId || !assessmentSetId) {
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  }
  if (!isPositivePostgresBigintText(assessmentSetId)) {
    return await notFound(event, 'ASSESSMENT_SET_NOT_FOUND', 'apiErrors.transfer_payment.review_setup_not_found')
  }

  const streamContext = await authorizeTransferPaymentStreamResource(event, 'create', profileId, streamId)
  if (!streamContext) {
    return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }

  await authorizeTransferPaymentStreamAction(event, 'create', streamContext, db)

  const body = await readValidatedBodyI18n(event, TransferPaymentAssessmentSetItemCreateSchema)
  return await executeFreshAuthorizedTransferPaymentStreamWrite(
    event,
    db,
    profileId,
    streamContext.agencyId,
    streamId,
    'create',
    async (trx, freshContext) => {
      const parentSet = await fetchAssessmentSetForStream(trx, streamId, assessmentSetId)
      if (!parentSet) {
        return await notFound(event, 'ASSESSMENT_SET_NOT_FOUND', 'apiErrors.transfer_payment.review_setup_not_found')
      }

      const hasValidSchema = await validateAssessmentReviewSchemasForAgency(
        trx,
        freshContext.agencyId,
        [{ entityType: parentSet.egcs_cn_entitytype, schemaId: String(body.egcs_cn_reviewschema) }]
      )
      if (!hasValidSchema) {
        return await badRequest(event, 'REVIEW_SCHEMA_NOT_FOUND', 'apiErrors.transfer_payment.review_schema_not_found')
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
        .insertInto('Common_Review_Setup')
        .values({
          egcs_cn_entitytype: parentSet.egcs_cn_entitytype,
          egcs_cn_order: body.egcs_cn_order,
          egcs_cn_reviewset: assessmentSetId,
          egcs_cn_approvaltemplate: body.egcs_cn_approvaltemplate,
          egcs_cn_reviewschema: body.egcs_cn_reviewschema,
          _deleted: false
        })
        .returningAll()
        .executeTakeFirstOrThrow()

      const schema = await trx
        .selectFrom('Common_Review_Schema')
        .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Review_Schema.id')
        .leftJoin('Common_Publication_Version', 'Common_Publication_Version.id', 'Common_Publication.egcs_cn_currentversion')
        .select([
          'egcs_cn_name_en',
          'egcs_cn_name_fr',
          'egcs_cn_outcomename_en',
          'egcs_cn_outcomename_fr',
          'egcs_cn_disablecustomoutcomes',
          'egcs_cn_disablealignment',
          'egcs_cn_disablereviewers',
          'Common_Publication.egcs_cn_state as publicationState',
          'Common_Publication.egcs_cn_currentversion as publicationVersionId',
          'Common_Publication_Version.egcs_cn_version as publicationVersion'
        ])
        .where('Common_Review_Schema.id', '=', body.egcs_cn_reviewschema)
        .executeTakeFirstOrThrow()

      return {
        id: String(created.id),
        egcs_cn_order: created.egcs_cn_order,
        egcs_cn_approvaltemplate: created.egcs_cn_approvaltemplate ? String(created.egcs_cn_approvaltemplate) : undefined,
        egcs_cn_reviewschema: String(created.egcs_cn_reviewschema),
        egcs_cn_disablecustomoutcomes: schema.egcs_cn_disablecustomoutcomes,
        egcs_cn_disablealignment: schema.egcs_cn_disablealignment,
        egcs_cn_disablereviewers: schema.egcs_cn_disablereviewers,
        _deleted: created._deleted,
        egcs_cn_name_en: schema.egcs_cn_name_en,
        egcs_cn_name_fr: schema.egcs_cn_name_fr,
        egcs_cn_outcomename_en: schema.egcs_cn_outcomename_en,
        egcs_cn_outcomename_fr: schema.egcs_cn_outcomename_fr,
        publicationId: String(created.egcs_cn_reviewschema),
        publicationState: schema.publicationState,
        publicationVersionId: schema.publicationVersionId === null ? null : String(schema.publicationVersionId),
        publicationVersion: schema.publicationVersion === null ? null : Number(schema.publicationVersion)
      }
    }
  )
})
