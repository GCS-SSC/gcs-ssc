import { TransferPaymentStreamReviewSetupCreateSchema } from '~~/shared/types/schemas'
import { authorize } from '~~/server/utils/authorize'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import {
  mapReviewSetupMembers,
  validateApprovalTemplateForScope,
  validateApprovalTemplatesForScope,
  validateReviewSchemasForAgency
} from '~~/server/utils/transfer-payment-polymorphic'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'
import { readReviewSetupPublicationMetadata } from '~~/server/utils/review-setup-versioning'
import { supportsDirectReviewConfiguration } from '~~/server/utils/entity-type-registry'

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

  await authorize(event, 'transfer_payment', 'create', createTransferPaymentScopedAuthorizeHandler('create', streamContext.scope, db))

  const body = await readValidatedBodyI18n(event, TransferPaymentStreamReviewSetupCreateSchema)
  const members = body.members ?? []
  return await executeFreshAuthorizedTransferPaymentStreamWrite(
    event, db, profileId, streamContext.agencyId, streamId, 'create', async (trx, freshContext) => {
      if (!await supportsDirectReviewConfiguration(trx, body.egcs_cn_entitytype)) {
        return await badRequest(event, 'UNSUPPORTED_REVIEW_ENTITY_TYPE', 'apiErrors.request.invalid')
      }
      /**
   * Finds the first member whose approval template is invalid for the stream-scoped common review picker.
   *
   * @returns The first invalid member, or null when all member approval templates are valid.
   */
      const findInvalidMemberApprovalTemplate = async () => {
        for (const member of members) {
          const approvalTemplateId = member.egcs_cn_approvaltemplate ? String(member.egcs_cn_approvaltemplate) : undefined
          if (!approvalTemplateId) {
            continue
          }

          const hasValidApprovalTemplate = await validateApprovalTemplateForScope(
            trx,
            streamId,
            approvalTemplateId
          )

          if (!hasValidApprovalTemplate) {
            return member
          }
        }

        return null
      }

      const reviewSchemaIds = members.map(member => String(member.egcs_cn_reviewschema))
      const uniqueReviewSchemaIds = Array.from(new Set(reviewSchemaIds))
      // Coerce numeric and string order values into a single comparable form before checking uniqueness.
      const uniqueOrders = new Set(members.map(member => String(member.egcs_cn_order)))

      if (uniqueReviewSchemaIds.length !== reviewSchemaIds.length) {
        return await badRequest(event, 'DUPLICATE_REVIEW_SETUP_MEMBERS', 'apiErrors.transfer_payment.duplicate_review_setup_members')
      }

      if (uniqueOrders.size !== members.length) {
        return await badRequest(event, 'DUPLICATE_REVIEW_SETUP_ORDER', 'apiErrors.transfer_payment.duplicate_review_setup_order')
      }

      const hasValidReviewSchemas = uniqueReviewSchemaIds.length === 0
        ? true
        : await validateReviewSchemasForAgency(trx, freshContext.agencyId, uniqueReviewSchemaIds.map(schemaId => ({
            entityType: body.egcs_cn_entitytype,
            schemaId
          })))
      if (!hasValidReviewSchemas) {
        return await badRequest(event, 'REVIEW_SCHEMA_NOT_FOUND', 'apiErrors.transfer_payment.review_schema_not_found')
      }

      const hasValidSetApprovalTemplate = await validateApprovalTemplateForScope(
        trx,
        streamId,
        body.egcs_cn_approvaltemplate ? String(body.egcs_cn_approvaltemplate) : undefined
      )
      if (!hasValidSetApprovalTemplate) {
        return await badRequest(
          event,
          'REVIEW_SET_APPROVAL_TEMPLATE_NOT_FOUND',
          'apiErrors.transfer_payment.review_set_approval_template_not_found'
        )
      }

      const memberApprovalTemplateIds = Array.from(
        new Set(
          members
            .map(member => member.egcs_cn_approvaltemplate ? String(member.egcs_cn_approvaltemplate) : null)
            .filter((value): value is string => value !== null)
        )
      )

      const hasValidMemberApprovalTemplates = await validateApprovalTemplatesForScope(
        trx,
        streamId,
        memberApprovalTemplateIds
      )
      if (!hasValidMemberApprovalTemplates) {
        const invalidMember = await findInvalidMemberApprovalTemplate()

        return await badRequest(
          event,
          'REVIEW_SETUP_MEMBER_APPROVAL_TEMPLATE_NOT_FOUND',
          'apiErrors.transfer_payment.review_setup_member_approval_template_not_found',
          invalidMember ? { order: invalidMember.egcs_cn_order } : undefined
        )
      }

      const createdSet = await trx
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

      const insertedMembers = members.length > 0
        ? await trx
            .insertInto('Common_Review_Setup')
            .values(
              members.map(member => ({
                egcs_cn_entitytype: body.egcs_cn_entitytype,
                egcs_cn_order: member.egcs_cn_order,
                egcs_cn_reviewset: String(createdSet.id),
                egcs_cn_approvaltemplate: member.egcs_cn_approvaltemplate,
                egcs_cn_reviewschema: member.egcs_cn_reviewschema,
                _deleted: false
              }))
            )
            .returning(['id', 'egcs_cn_reviewset', 'egcs_cn_reviewschema', 'egcs_cn_order', 'egcs_cn_approvaltemplate', '_deleted'])
            .execute()
        : []

      return {
        id: String(createdSet.id),
        egcs_cn_entitytype: createdSet.egcs_cn_entitytype,
        egcs_cn_name_en: createdSet.egcs_cn_name_en,
        egcs_cn_name_fr: createdSet.egcs_cn_name_fr,
        egcs_cn_order: createdSet.egcs_cn_order,
        egcs_cn_sequential: createdSet.egcs_cn_sequential,
        egcs_cn_approvaltemplate: createdSet.egcs_cn_approvaltemplate ? String(createdSet.egcs_cn_approvaltemplate) : undefined,
        _deleted: createdSet._deleted,
        members: mapReviewSetupMembers(insertedMembers),
        ...await readReviewSetupPublicationMetadata(trx, createdSet)
      }
    }
  )
})
