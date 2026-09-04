import { TransferPaymentStreamReviewSetupSchemaCreateSchema } from '~~/shared/types/schemas'
import { authorize } from '~~/server/utils/authorize'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { validateApprovalTemplateForScope } from '~~/server/utils/transfer-payment-polymorphic'
import { DEFAULT_CHECKLIST_DEFINITION } from '~~/server/utils/transfer-payment-checklist-schemas'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'
import { throwIfReviewSetupMemberConstraintError } from '~~/server/utils/review-setup-member-constraint-errors'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

const EMPTY_ASSESSMENT_DEFINITION = {
  sections: [],
  sectionMatrix: [],
  outcomes: []
}

export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  const reviewSetupId = getRouterParam(event, 'reviewSetupId')
  if (!profileId || !streamId || !reviewSetupId) {
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  }
  if (!isPositivePostgresBigintText(reviewSetupId)) return await notFound(event, 'REVIEW_SETUP_NOT_FOUND', 'apiErrors.transfer_payment.review_setup_not_found')

  const streamContext = await authorizeTransferPaymentStreamResource(event, 'create', profileId, streamId)
  if (!streamContext) {
    return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }
  await authorize(event, 'transfer_payment', 'create', createTransferPaymentScopedAuthorizeHandler('create', streamContext.scope, db))

  const body = await readValidatedBodyI18n(event, TransferPaymentStreamReviewSetupSchemaCreateSchema)
  try {
    return await executeFreshAuthorizedTransferPaymentStreamWrite(
      event, db, profileId, streamContext.agencyId, streamId, 'create', async (trx, freshContext) => {
        const parentSet = await trx.selectFrom('Common_Review_Set_Setup')
          .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Review_Set_Setup.id')
          .select(['Common_Review_Set_Setup.id', 'Common_Review_Set_Setup.egcs_cn_entitytype', 'Common_Publication.egcs_cn_state as publicationState'])
          .where('Common_Review_Set_Setup.id', '=', reviewSetupId)
          .where('Common_Review_Set_Setup.egcs_cn_scopetype', '=', 'transferpaymentstream')
          .where('Common_Review_Set_Setup.egcs_cn_scopeid', '=', streamId)
          .where('Common_Review_Set_Setup._deleted', '=', false)
          .where('Common_Publication._deleted', '=', false)
          .forUpdate(['Common_Review_Set_Setup', 'Common_Publication'])
          .executeTakeFirst()
        if (!parentSet) return await notFound(event, 'REVIEW_SETUP_NOT_FOUND', 'apiErrors.transfer_payment.review_setup_not_found')
        if (parentSet.publicationState === 'retired') {
          return await throwApiError(event, { statusCode: 409, code: 'PUBLICATION_RETIRED', key: 'apiErrors.request.invalid_status' })
        }
        if (body.egcs_cn_approvaltemplate) {
          const validTemplate = await validateApprovalTemplateForScope(trx, streamId, body.egcs_cn_approvaltemplate)
          if (!validTemplate) {
            return await badRequest(event, 'REVIEW_SETUP_MEMBER_APPROVAL_TEMPLATE_NOT_FOUND', 'apiErrors.transfer_payment.review_setup_member_approval_template_not_found', { order: body.egcs_cn_order })
          }
        }
        const existingOrder = await trx.selectFrom('Common_Review_Setup')
          .select('id')
          .where('egcs_cn_reviewset', '=', reviewSetupId)
          .where('egcs_cn_order', '=', body.egcs_cn_order)
          .where('_deleted', '=', false)
          .executeTakeFirst()
        if (existingOrder) {
          return await badRequest(event, 'DUPLICATE_REVIEW_SETUP_ORDER', 'apiErrors.transfer_payment.duplicate_review_setup_order')
        }
        const isChecklist = body.egcs_cn_reviewtype === 'checklist'
        const schema = await trx.insertInto('Common_Review_Schema').values({
          egcs_cn_reviewtype: body.egcs_cn_reviewtype,
          egcs_cn_agency: freshContext.agencyId,
          egcs_cn_entitytype: parentSet.egcs_cn_entitytype,
          egcs_cn_name_en: isChecklist ? 'Untitled checklist' : 'Untitled assessment',
          egcs_cn_name_fr: isChecklist ? 'Liste de contrôle sans titre' : 'Évaluation sans titre',
          egcs_cn_outcomename_en: isChecklist ? 'Result' : 'Outcome',
          egcs_cn_outcomename_fr: 'Résultat',
          egcs_cn_disablecustomoutcomes: isChecklist,
          egcs_cn_disablealignment: isChecklist,
          egcs_cn_disablereviewers: false,
          egcs_cn_scoringmatrix: isChecklist ? null : [],
          egcs_cn_assessmentschema: isChecklist ? null : EMPTY_ASSESSMENT_DEFINITION,
          _deleted: false
        }).returning('id').executeTakeFirstOrThrow()

        if (isChecklist) {
          await trx.insertInto('Common_Checklist_Schema').values({
            egcs_cn_reviewschema: String(schema.id),
            egcs_cn_checklistschema: DEFAULT_CHECKLIST_DEFINITION,
            _deleted: false
          }).execute()
        } else {
          await trx.insertInto('Common_Assessment_Schema').values({
            egcs_cn_reviewschema: String(schema.id),
            egcs_cn_scoringmatrix: [],
            egcs_cn_assessmentschema: EMPTY_ASSESSMENT_DEFINITION,
            egcs_cn_outcomename_en: 'Outcome',
            egcs_cn_outcomename_fr: 'Résultat',
            egcs_cn_disablecustomoutcomes: false,
            egcs_cn_disablealignment: false,
            _deleted: false
          }).execute()
        }

        await trx.insertInto('Common_Review_Setup').values({
          egcs_cn_entitytype: parentSet.egcs_cn_entitytype,
          egcs_cn_order: body.egcs_cn_order,
          egcs_cn_reviewset: reviewSetupId,
          egcs_cn_approvaltemplate: body.egcs_cn_approvaltemplate,
          egcs_cn_reviewschema: String(schema.id),
          _deleted: false
        }).execute()
        return { schemaId: String(schema.id), reviewType: body.egcs_cn_reviewtype }
      }
    )
  } catch (error) {
    return await throwIfReviewSetupMemberConstraintError(event, error)
  }
})
