import { validateReviewSetApprovalTemplateForAgency } from '~~/server/utils/agency-review-set-dependencies'
import { TransferPaymentStreamReviewSetupMemberCreateSchema } from '~~/shared/types/schemas'
import { authorize } from '~~/server/utils/authorize'
import { withActiveAgencyMutationTransaction } from '~~/server/utils/agency-auth'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { throwIfReviewSetupMemberConstraintError } from '~~/server/utils/review-setup-member-constraint-errors'
import {
  validateReviewSchemasForAgency
} from '~~/server/utils/transfer-payment-polymorphic'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { isAssignableGroup } from '~~/server/utils/groups'

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'agencyId') ?? ''
  const reviewSetupId = getRouterParam(event, 'reviewSetId') ?? ''
  await authorize(event, 'agency', 'update', { type: 'agency', agencyId })
  if (!isPositivePostgresBigintText(reviewSetupId)) return await notFound(event, 'REVIEW_SETUP_NOT_FOUND', 'apiErrors.transfer_payment.review_setup_not_found')
  const body = await readValidatedBodyI18n(event, TransferPaymentStreamReviewSetupMemberCreateSchema)

  try {
    return await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
      const parentSet = await trx
        .selectFrom('Common_Review_Set_Setup')
        .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Review_Set_Setup.id')
        .selectAll('Common_Review_Set_Setup')
        .select('Common_Publication.egcs_cn_state as publicationState')
        .where('Common_Review_Set_Setup.id', '=', reviewSetupId)
        .where('Common_Review_Set_Setup.egcs_cn_agency', '=', agencyId)
        .where('Common_Review_Set_Setup._deleted', '=', false)
        .forUpdate(['Common_Review_Set_Setup', 'Common_Publication'])
        .executeTakeFirst()

      if (!parentSet) {
        return await notFound(event, 'REVIEW_SETUP_NOT_FOUND', 'apiErrors.transfer_payment.review_setup_not_found')
      }
      if (parentSet.publicationState === 'retired') {
        return await throwApiError(event, {
          statusCode: 409, code: 'PUBLICATION_RETIRED', key: 'apiErrors.request.invalid_status'
        })
      }

      const hasValidReviewSchema = await validateReviewSchemasForAgency(
        trx,
        agencyId,
        [{ entityType: parentSet.egcs_cn_entitytype, schemaId: String(body.egcs_cn_reviewschema) }]
      )
      if (!hasValidReviewSchema) {
        return await badRequest(event, 'REVIEW_SCHEMA_NOT_FOUND', 'apiErrors.transfer_payment.review_schema_not_found')
      }
      if (body.egcs_cn_defaultgroup && !await isAssignableGroup(trx, body.egcs_cn_defaultgroup, agencyId)) {
        return await badRequest(event, 'REVIEW_GROUP_INVALID', 'apiErrors.request.invalid')
      }

      const existingMembers = await trx
        .selectFrom('Common_Review_Setup')
        .select(['egcs_cn_reviewschema', 'egcs_cn_order'])
        .where('egcs_cn_reviewset', '=', reviewSetupId)
        .where('_deleted', '=', false)
        .execute()

      if (existingMembers.some(member => String(member.egcs_cn_reviewschema) === String(body.egcs_cn_reviewschema))) {
        return await badRequest(event, 'DUPLICATE_REVIEW_SETUP_MEMBERS', 'apiErrors.transfer_payment.duplicate_review_setup_members')
      }

      const targetOrder = body.egcs_cn_order
      if (existingMembers.some(member => member.egcs_cn_order === targetOrder)) {
        return await badRequest(event, 'DUPLICATE_REVIEW_SETUP_ORDER', 'apiErrors.transfer_payment.duplicate_review_setup_order')
      }

      if (body.egcs_cn_approvaltemplate) {
        const hasValidApprovalTemplateForOrder = await validateReviewSetApprovalTemplateForAgency(
          trx,
          agencyId,
          body.egcs_cn_approvaltemplate
        )
        if (!hasValidApprovalTemplateForOrder) {
          return await badRequest(
            event,
            'REVIEW_SETUP_MEMBER_APPROVAL_TEMPLATE_NOT_FOUND',
            'apiErrors.transfer_payment.review_setup_member_approval_template_not_found',
            { order: targetOrder }
          )
        }
      }

      const created = await trx
        .insertInto('Common_Review_Setup')
        .values({
          egcs_cn_entitytype: parentSet.egcs_cn_entitytype,
          egcs_cn_order: targetOrder,
          egcs_cn_reviewset: reviewSetupId,
          egcs_cn_approvaltemplate: body.egcs_cn_approvaltemplate,
          egcs_cn_reviewschema: body.egcs_cn_reviewschema,
          egcs_cn_defaultgroup: body.egcs_cn_defaultgroup,
          egcs_cn_failonchecklistfailure: body.egcs_cn_failonchecklistfailure,
          egcs_cn_failurethreshold: body.egcs_cn_failurethreshold,
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
        egcs_cn_reviewschema: String(created.egcs_cn_reviewschema),
        egcs_cn_order: created.egcs_cn_order,
        egcs_cn_approvaltemplate: created.egcs_cn_approvaltemplate ? String(created.egcs_cn_approvaltemplate) : undefined,
        egcs_cn_failonchecklistfailure: created.egcs_cn_failonchecklistfailure,
        egcs_cn_failurethreshold: created.egcs_cn_failurethreshold,
        egcs_cn_disablecustomoutcomes: schema.egcs_cn_disablecustomoutcomes,
        egcs_cn_disablealignment: schema.egcs_cn_disablealignment,
        egcs_cn_disablereviewers: schema.egcs_cn_disablereviewers,
        egcs_cn_name_en: schema.egcs_cn_name_en,
        egcs_cn_name_fr: schema.egcs_cn_name_fr,
        egcs_cn_outcomename_en: schema.egcs_cn_outcomename_en,
        egcs_cn_outcomename_fr: schema.egcs_cn_outcomename_fr,
        publicationId: String(created.egcs_cn_reviewschema),
        publicationState: schema.publicationState,
        publicationVersionId: schema.publicationVersionId === null ? null : String(schema.publicationVersionId),
        publicationVersion: schema.publicationVersion === null ? null : Number(schema.publicationVersion),
        _deleted: created._deleted
      }
    }
    )
  } catch (error: unknown) {
    return await throwIfReviewSetupMemberConstraintError(event, error)
  }
})
