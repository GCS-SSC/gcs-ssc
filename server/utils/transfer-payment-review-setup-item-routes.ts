/* eslint-disable jsdoc/require-jsdoc */
import type { H3Event } from 'h3'
import type { Kysely, Selectable } from 'kysely'
import type { z } from 'zod'
import type {
  CommonReviewSetSetupTable,
  CommonReviewSetupTable,
  Database
} from '~~/shared/types/database'
import type { TransferPaymentStreamReviewSetupMemberPatchSchema } from '~~/shared/types/schemas'
import { badRequest, notFound, throwApiError } from './api-errors'
import {
  validateApprovalTemplateForScope,
  validateReviewSchemasForAgency
} from './transfer-payment-polymorphic'

type ReviewSetupMemberPatchBody = z.infer<typeof TransferPaymentStreamReviewSetupMemberPatchSchema>
type ReviewSetSetupRow = Selectable<CommonReviewSetSetupTable>
type ReviewSetupItemRow = Selectable<CommonReviewSetupTable>

interface PatchReviewSetupItemOptions {
  agencyId: string
  streamId: string
  reviewSetupId: string
  itemId: string
  body: ReviewSetupMemberPatchBody
}

const reviewSetupItemSchemaSelectFields = [
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
] as const

const findReviewSetupSet = async (
  db: Kysely<Database>,
  streamId: string,
  reviewSetupId: string
) => {
  return await db
    .selectFrom('Common_Review_Set_Setup')
    .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Review_Set_Setup.id')
    .selectAll('Common_Review_Set_Setup')
    .select('Common_Publication.egcs_cn_state as publicationState')
    .where('Common_Review_Set_Setup.id', '=', reviewSetupId)
    .where('Common_Review_Set_Setup.egcs_cn_scopetype', '=', 'transferpaymentstream')
    .where('Common_Review_Set_Setup.egcs_cn_scopeid', '=', streamId)
    .where('Common_Review_Set_Setup._deleted', '=', false)
    .forUpdate(['Common_Review_Set_Setup', 'Common_Publication'])
    .executeTakeFirst()
}

const findReviewSetupItem = async (
  db: Kysely<Database>,
  reviewSetupId: string,
  itemId: string
) => {
  return await db
    .selectFrom('Common_Review_Setup')
    .selectAll()
    .where('id', '=', itemId)
    .where('egcs_cn_reviewset', '=', reviewSetupId)
    .where('_deleted', '=', false)
    .executeTakeFirst()
}

const validateReviewSetupItemSchema = async (
  event: H3Event,
  db: Kysely<Database>,
  agencyId: string,
  parentSet: ReviewSetSetupRow,
  body: ReviewSetupMemberPatchBody
) => {
  if (body.egcs_cn_reviewschema === undefined) {
    return null
  }

  const hasValidReviewSchema = await validateReviewSchemasForAgency(
    db,
    agencyId,
    [{ entityType: parentSet.egcs_cn_entitytype, schemaId: String(body.egcs_cn_reviewschema) }]
  )

  return hasValidReviewSchema
    ? null
    : await badRequest(event, 'REVIEW_SCHEMA_NOT_FOUND', 'apiErrors.transfer_payment.review_schema_not_found')
}

const validateReviewSetupItemApprovalTemplate = async (
  event: H3Event,
  db: Kysely<Database>,
  streamId: string,
  body: ReviewSetupMemberPatchBody,
  currentItem: ReviewSetupItemRow
) => {
  if (body.egcs_cn_approvaltemplate === undefined) {
    return null
  }

  const targetApprovalTemplateId = body.egcs_cn_approvaltemplate
    ? String(body.egcs_cn_approvaltemplate)
    : undefined
  const hasValidApprovalTemplate = await validateApprovalTemplateForScope(
    db,
    streamId,
    targetApprovalTemplateId
  )

  return hasValidApprovalTemplate
    ? null
    : await badRequest(
        event,
        'REVIEW_SETUP_MEMBER_APPROVAL_TEMPLATE_NOT_FOUND',
        'apiErrors.transfer_payment.review_setup_member_approval_template_not_found',
        { order: body.egcs_cn_order ?? currentItem.egcs_cn_order }
      )
}

const validateReviewSetupItemUniqueness = async (
  event: H3Event,
  db: Kysely<Database>,
  reviewSetupId: string,
  itemId: string,
  body: ReviewSetupMemberPatchBody,
  currentItem: ReviewSetupItemRow
) => {
  const targetReviewSchema = body.egcs_cn_reviewschema !== undefined
    ? String(body.egcs_cn_reviewschema)
    : String(currentItem.egcs_cn_reviewschema)
  const targetOrder = body.egcs_cn_order ?? currentItem.egcs_cn_order
  const siblingMembers = await db
    .selectFrom('Common_Review_Setup')
    .select(['id', 'egcs_cn_reviewschema', 'egcs_cn_order'])
    .where('egcs_cn_reviewset', '=', reviewSetupId)
    .where('_deleted', '=', false)
    .where('id', '!=', itemId)
    .execute()

  if (siblingMembers.some(member => String(member.egcs_cn_reviewschema) === targetReviewSchema)) {
    return await badRequest(event, 'DUPLICATE_REVIEW_SETUP_MEMBERS', 'apiErrors.transfer_payment.duplicate_review_setup_members')
  }

  if (siblingMembers.some(member => member.egcs_cn_order === targetOrder)) {
    return await badRequest(event, 'DUPLICATE_REVIEW_SETUP_ORDER', 'apiErrors.transfer_payment.duplicate_review_setup_order')
  }

  return null
}

const validateReviewSetupItemPatch = async (
  event: H3Event,
  db: Kysely<Database>,
  options: PatchReviewSetupItemOptions,
  parentSet: ReviewSetSetupRow,
  currentItem: ReviewSetupItemRow
) => {
  const schemaError = await validateReviewSetupItemSchema(event, db, options.agencyId, parentSet, options.body)
  if (schemaError) return schemaError

  const approvalTemplateError = await validateReviewSetupItemApprovalTemplate(event, db, options.streamId, options.body, currentItem)
  if (approvalTemplateError) return approvalTemplateError

  return await validateReviewSetupItemUniqueness(
    event,
    db,
    options.reviewSetupId,
    options.itemId,
    options.body,
    currentItem
  )
}

const buildReviewSetupItemUpdatePayload = (body: ReviewSetupMemberPatchBody): Record<string, unknown> => {
  const updatePayload: Record<string, unknown> = {}
  if (body.egcs_cn_order !== undefined) updatePayload.egcs_cn_order = body.egcs_cn_order
  if (body.egcs_cn_approvaltemplate !== undefined) updatePayload.egcs_cn_approvaltemplate = body.egcs_cn_approvaltemplate
  if (body.egcs_cn_reviewschema !== undefined) updatePayload.egcs_cn_reviewschema = body.egcs_cn_reviewschema
  if (body.egcs_cn_failonchecklistfailure !== undefined) updatePayload.egcs_cn_failonchecklistfailure = body.egcs_cn_failonchecklistfailure
  if (body.egcs_cn_failurethreshold !== undefined) updatePayload.egcs_cn_failurethreshold = body.egcs_cn_failurethreshold
  return updatePayload
}

const updateReviewSetupItem = async (
  db: Kysely<Database>,
  reviewSetupId: string,
  itemId: string,
  body: ReviewSetupMemberPatchBody,
  currentItem: ReviewSetupItemRow
) => {
  const updatePayload = buildReviewSetupItemUpdatePayload(body)
  if (Object.keys(updatePayload).length === 0) {
    return currentItem
  }

  return await db
    .updateTable('Common_Review_Setup')
    .set(updatePayload)
    .where('id', '=', itemId)
    .where('egcs_cn_reviewset', '=', reviewSetupId)
    .where('_deleted', '=', false)
    .returningAll()
    .executeTakeFirst()
}

const fetchReviewSetupItemSchema = async (
  db: Kysely<Database>,
  schemaId: string
) => {
  return await db
    .selectFrom('Common_Review_Schema')
    .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Review_Schema.id')
    .leftJoin('Common_Publication_Version', 'Common_Publication_Version.id', 'Common_Publication.egcs_cn_currentversion')
    .select(reviewSetupItemSchemaSelectFields)
    .where('Common_Review_Schema.id', '=', schemaId)
    .where('Common_Review_Schema._deleted', '=', false)
    .executeTakeFirstOrThrow()
}

export const patchTransferPaymentReviewSetupItem = async (
  event: H3Event,
  db: Kysely<Database>,
  options: PatchReviewSetupItemOptions
) => {
  const parentSet = await findReviewSetupSet(db, options.streamId, options.reviewSetupId)
  if (!parentSet) {
    return await notFound(event, 'REVIEW_SETUP_NOT_FOUND', 'apiErrors.transfer_payment.review_setup_not_found')
  }
  if (parentSet.publicationState === 'retired') {
    return await throwApiError(event, {
      statusCode: 409, code: 'PUBLICATION_RETIRED', key: 'apiErrors.request.invalid_status'
    })
  }

  const currentItem = await findReviewSetupItem(db, options.reviewSetupId, options.itemId)
  if (!currentItem) {
    return await notFound(event, 'REVIEW_SETUP_MEMBER_NOT_FOUND', 'apiErrors.transfer_payment.review_schema_not_found')
  }

  const validationError = await validateReviewSetupItemPatch(event, db, options, parentSet, currentItem)
  if (validationError) return validationError

  const updated = await updateReviewSetupItem(db, options.reviewSetupId, options.itemId, options.body, currentItem)
  if (!updated) {
    return await notFound(event, 'REVIEW_SETUP_MEMBER_NOT_FOUND', 'apiErrors.transfer_payment.review_schema_not_found')
  }
  const schemaId = String(updated.egcs_cn_reviewschema ?? currentItem.egcs_cn_reviewschema)
  const schema = await fetchReviewSetupItemSchema(db, schemaId)

  return {
    id: String(updated.id),
    egcs_cn_reviewschema: schemaId,
    egcs_cn_order: updated.egcs_cn_order ?? currentItem.egcs_cn_order,
    egcs_cn_approvaltemplate: updated.egcs_cn_approvaltemplate != null
      ? String(updated.egcs_cn_approvaltemplate)
      : undefined,
    egcs_cn_failonchecklistfailure: updated.egcs_cn_failonchecklistfailure,
    egcs_cn_failurethreshold: updated.egcs_cn_failurethreshold,
    egcs_cn_disablecustomoutcomes: schema.egcs_cn_disablecustomoutcomes,
    egcs_cn_disablealignment: schema.egcs_cn_disablealignment,
    egcs_cn_disablereviewers: schema.egcs_cn_disablereviewers,
    egcs_cn_name_en: schema.egcs_cn_name_en,
    egcs_cn_name_fr: schema.egcs_cn_name_fr,
    egcs_cn_outcomename_en: schema.egcs_cn_outcomename_en,
    egcs_cn_outcomename_fr: schema.egcs_cn_outcomename_fr,
    publicationId: schemaId,
    publicationState: schema.publicationState,
    publicationVersionId: schema.publicationVersionId === null ? null : String(schema.publicationVersionId),
    publicationVersion: schema.publicationVersion === null ? null : Number(schema.publicationVersion),
    _deleted: updated._deleted ?? currentItem._deleted
  }
}
