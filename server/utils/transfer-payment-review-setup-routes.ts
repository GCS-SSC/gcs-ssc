/* eslint-disable jsdoc/require-jsdoc */
import type { H3Event } from 'h3'
import type { Insertable, Kysely, Selectable } from 'kysely'
import type { z } from 'zod'
import type {
  CommonReviewSetSetupTable,
  CommonReviewSetupTable,
  Database
} from '~~/shared/types/database'
import type { TransferPaymentStreamReviewSetupPatchSchema } from '~~/shared/types/schemas'
import { badRequest, notFound, throwApiError } from './api-errors'
import {
  mapReviewSetupMembers,
  validateApprovalTemplateForScope,
  validateApprovalTemplatesForScope,
  validateReviewSchemasForAgency
} from './transfer-payment-polymorphic'
import { readReviewSetupPublicationMetadata } from './review-setup-versioning'
import { supportsDirectReviewConfiguration } from './entity-type-registry'

type ReviewSetupPatchBody = z.infer<typeof TransferPaymentStreamReviewSetupPatchSchema>
type ReviewSetupMember = NonNullable<ReviewSetupPatchBody['members']>[number]
type ReviewSetSetupRow = Selectable<CommonReviewSetSetupTable>
type ReviewSetupUpdatePayload = Record<string, unknown>
type ReviewSetupInsertPayload = Insertable<CommonReviewSetupTable>

type ReviewSetupMemberRow = Parameters<typeof mapReviewSetupMembers>[0][number]

interface PatchTransferPaymentReviewSetupOptions {
  agencyId: string
  streamId: string
  reviewSetupId: string
  body: ReviewSetupPatchBody
}

const reviewSetupPatchColumns = [
  'egcs_cn_entitytype',
  'egcs_cn_name_en',
  'egcs_cn_name_fr',
  'egcs_cn_description_en',
  'egcs_cn_description_fr',
  'egcs_cn_order',
  'egcs_cn_sequential',
  'egcs_cn_approvaltemplate'
] as const

const reviewSetupMemberSelectFields = [
  'Common_Review_Setup.id as id',
  'Common_Review_Setup.egcs_cn_reviewset as egcs_cn_reviewset',
  'Common_Review_Setup.egcs_cn_reviewschema as egcs_cn_reviewschema',
  'Common_Review_Setup.egcs_cn_order as egcs_cn_order',
  'Common_Review_Setup.egcs_cn_approvaltemplate as egcs_cn_approvaltemplate',
  'Common_Review_Setup.egcs_cn_failonchecklistfailure as egcs_cn_failonchecklistfailure',
  'Common_Review_Setup.egcs_cn_failurethreshold as egcs_cn_failurethreshold',
  'Common_Review_Schema.egcs_cn_name_en as egcs_cn_name_en',
  'Common_Review_Schema.egcs_cn_name_fr as egcs_cn_name_fr',
  'Common_Review_Schema.egcs_cn_outcomename_en as egcs_cn_outcomename_en',
  'Common_Review_Schema.egcs_cn_outcomename_fr as egcs_cn_outcomename_fr',
  'Common_Review_Schema.egcs_cn_disablecustomoutcomes as egcs_cn_disablecustomoutcomes',
  'Common_Review_Schema.egcs_cn_disablealignment as egcs_cn_disablealignment',
  'Common_Review_Schema.egcs_cn_disablereviewers as egcs_cn_disablereviewers',
  'Review_Schema_Publication.id as publicationId',
  'Review_Schema_Publication.egcs_cn_state as publicationState',
  'Review_Schema_Publication.egcs_cn_currentversion as publicationVersionId',
  'Review_Schema_Version.egcs_cn_version as publicationVersion',
  'Common_Review_Schema.egcs_cn_reviewtype as egcs_cn_reviewtype',
  'Common_Review_Setup._deleted as _deleted'
] as const

const hasDuplicateValues = (values: string[]) => new Set(values).size !== values.length

const resolveReviewSetupEntityType = (
  body: ReviewSetupPatchBody,
  currentSet: ReviewSetSetupRow
) => {
  if (body.egcs_cn_entitytype !== undefined) {
    return body.egcs_cn_entitytype
  }

  return currentSet.egcs_cn_entitytype
}

const resolveReviewSetupApprovalTemplateId = (
  body: ReviewSetupPatchBody,
  currentSet: ReviewSetSetupRow
) => {
  if (body.egcs_cn_approvaltemplate !== undefined) {
    return body.egcs_cn_approvaltemplate ? String(body.egcs_cn_approvaltemplate) : undefined
  }

  return currentSet.egcs_cn_approvaltemplate ? String(currentSet.egcs_cn_approvaltemplate) : undefined
}

const buildReviewSetupUpdatePayload = (body: ReviewSetupPatchBody): ReviewSetupUpdatePayload => {
  const updatePayload: ReviewSetupUpdatePayload = {}

  for (const column of reviewSetupPatchColumns) {
    if (body[column] !== undefined) {
      updatePayload[column] = body[column]
    }
  }

  return updatePayload
}

const findReviewSetup = async (
  db: Kysely<Database>,
  streamId: string,
  reviewSetupId: string
) => {
  return await db
    .selectFrom('Common_Review_Set_Setup')
    .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Review_Set_Setup.id')
    .selectAll('Common_Review_Set_Setup')
    .select('Common_Publication.egcs_cn_state as publicationState')
    .where(eb => eb.and([
      eb('Common_Review_Set_Setup.id', '=', reviewSetupId),
      eb('Common_Review_Set_Setup.egcs_cn_scopetype', '=', 'transferpaymentstream'),
      eb('Common_Review_Set_Setup.egcs_cn_scopeid', '=', streamId),
      eb('Common_Review_Set_Setup._deleted', '=', false)
    ]))
    .forUpdate(['Common_Review_Set_Setup', 'Common_Publication'])
    .executeTakeFirst()
}

const validateReviewSetupMemberUniqueness = async (
  event: H3Event,
  members: ReviewSetupMember[]
) => {
  const reviewSchemaIds = members.map(member => String(member.egcs_cn_reviewschema))
  if (hasDuplicateValues(reviewSchemaIds)) {
    return await badRequest(event, 'DUPLICATE_REVIEW_SETUP_MEMBERS', 'apiErrors.transfer_payment.duplicate_review_setup_members')
  }

  const orders = members.map(member => String(member.egcs_cn_order))
  if (hasDuplicateValues(orders)) {
    return await badRequest(event, 'DUPLICATE_REVIEW_SETUP_ORDER', 'apiErrors.transfer_payment.duplicate_review_setup_order')
  }

  return null
}

const validateReviewSetupMemberSchemas = async (
  event: H3Event,
  db: Kysely<Database>,
  agencyId: string,
  body: ReviewSetupPatchBody,
  currentSet: ReviewSetSetupRow,
  members: ReviewSetupMember[]
) => {
  if (members.length === 0) {
    return null
  }

  const uniqueReviewSchemaIds = Array.from(new Set(members.map(member => String(member.egcs_cn_reviewschema))))
  const hasValidReviewSchemas = await validateReviewSchemasForAgency(
    db,
    agencyId,
    uniqueReviewSchemaIds.map(schemaId => ({
      entityType: resolveReviewSetupEntityType(body, currentSet),
      schemaId
    }))
  )

  if (!hasValidReviewSchemas) {
    return await badRequest(event, 'REVIEW_SCHEMA_NOT_FOUND', 'apiErrors.transfer_payment.review_schema_not_found')
  }

  return null
}

const validateReviewSetupApprovalTemplate = async (
  event: H3Event,
  db: Kysely<Database>,
  streamId: string,
  body: ReviewSetupPatchBody,
  currentSet: ReviewSetSetupRow
) => {
  const targetSetApprovalTemplateId = resolveReviewSetupApprovalTemplateId(body, currentSet)
  const hasValidSetApprovalTemplate = await validateApprovalTemplateForScope(
    db,
    streamId,
    targetSetApprovalTemplateId
  )

  if (!hasValidSetApprovalTemplate) {
    return await badRequest(
      event,
      'REVIEW_SET_APPROVAL_TEMPLATE_NOT_FOUND',
      'apiErrors.transfer_payment.review_set_approval_template_not_found'
    )
  }

  return null
}

const collectReviewSetupMemberApprovalTemplateIds = (members: ReviewSetupMember[]) => {
  const approvalTemplateIds = new Set<string>()

  for (const member of members) {
    if (member.egcs_cn_approvaltemplate) {
      approvalTemplateIds.add(String(member.egcs_cn_approvaltemplate))
    }
  }

  return [...approvalTemplateIds]
}

const checkReviewSetupMemberApprovalTemplate = async (
  db: Kysely<Database>,
  streamId: string,
  member: ReviewSetupMember
) => {
  const approvalTemplateId = member.egcs_cn_approvaltemplate

  return {
    member,
    isValid: approvalTemplateId
      ? await validateApprovalTemplateForScope(db, streamId, String(approvalTemplateId))
      : true
  }
}

const findInvalidMemberApprovalTemplate = async (
  db: Kysely<Database>,
  streamId: string,
  members: ReviewSetupMember[]
) => {
  const checkedMembers = await Promise.all(
    members.map(member => checkReviewSetupMemberApprovalTemplate(db, streamId, member))
  )

  return checkedMembers.find(checkedMember => !checkedMember.isValid)?.member ?? null
}

const validateReviewSetupMemberApprovalTemplates = async (
  event: H3Event,
  db: Kysely<Database>,
  streamId: string,
  members: ReviewSetupMember[]
) => {
  const memberApprovalTemplateIds = collectReviewSetupMemberApprovalTemplateIds(members)
  const hasValidMemberApprovalTemplates = await validateApprovalTemplatesForScope(
    db,
    streamId,
    memberApprovalTemplateIds
  )

  if (hasValidMemberApprovalTemplates) {
    return null
  }

  const invalidMember = await findInvalidMemberApprovalTemplate(db, streamId, members)
  return await badRequest(
    event,
    'REVIEW_SETUP_MEMBER_APPROVAL_TEMPLATE_NOT_FOUND',
    'apiErrors.transfer_payment.review_setup_member_approval_template_not_found',
    invalidMember ? { order: invalidMember.egcs_cn_order } : undefined
  )
}

const mapExistingMembersForValidation = (members: ReviewSetupMemberRow[]): ReviewSetupMember[] => {
  return members.map(member => ({
    egcs_cn_reviewschema: String(member.egcs_cn_reviewschema),
    egcs_cn_order: member.egcs_cn_order,
    egcs_cn_failonchecklistfailure: member.egcs_cn_failonchecklistfailure === true,
    egcs_cn_failurethreshold: member.egcs_cn_failurethreshold !== undefined
      ? member.egcs_cn_failurethreshold
      : null,
    egcs_cn_approvaltemplate: member.egcs_cn_approvaltemplate
      ? String(member.egcs_cn_approvaltemplate)
      : undefined
  }))
}

const validateReviewSetupPatch = async (
  event: H3Event,
  db: Kysely<Database>,
  options: PatchTransferPaymentReviewSetupOptions,
  currentSet: ReviewSetSetupRow
) => {
  if (!await supportsDirectReviewConfiguration(
    db,
    resolveReviewSetupEntityType(options.body, currentSet)
  )) {
    return await badRequest(event, 'UNSUPPORTED_REVIEW_ENTITY_TYPE', 'apiErrors.request.invalid')
  }
  const entityTypeChanged = options.body.egcs_cn_entitytype !== undefined
    && options.body.egcs_cn_entitytype !== currentSet.egcs_cn_entitytype
  if (entityTypeChanged) {
    const historicalMember = await db.selectFrom('Common_Review_Setup').select('id')
      .where('egcs_cn_reviewset', '=', options.reviewSetupId).executeTakeFirst()
    if (historicalMember) {
      return await badRequest(event, 'REVIEW_SETUP_ENTITY_TYPE_IMMUTABLE', 'apiErrors.request.invalid_status')
    }
  }
  const members = options.body.members ?? (
    entityTypeChanged
      ? mapExistingMembersForValidation(await fetchActiveReviewSetupMembers(db, options.reviewSetupId))
      : []
  )

  const uniquenessError = await validateReviewSetupMemberUniqueness(event, members)
  if (uniquenessError) return uniquenessError

  const schemaError = await validateReviewSetupMemberSchemas(event, db, options.agencyId, options.body, currentSet, members)
  if (schemaError) return schemaError

  const setApprovalTemplateError = await validateReviewSetupApprovalTemplate(event, db, options.streamId, options.body, currentSet)
  if (setApprovalTemplateError) return setApprovalTemplateError

  const memberApprovalTemplateError = await validateReviewSetupMemberApprovalTemplates(event, db, options.streamId, members)
  if (memberApprovalTemplateError) return memberApprovalTemplateError

  return null
}

const updateReviewSetupSet = async (
  db: Kysely<Database>,
  reviewSetupId: string,
  body: ReviewSetupPatchBody,
  currentSet: ReviewSetSetupRow
) => {
  const updatePayload = buildReviewSetupUpdatePayload(body)

  if (Object.keys(updatePayload).length === 0) {
    return currentSet
  }

  return await db
    .updateTable('Common_Review_Set_Setup')
    .set(updatePayload)
    .where('id', '=', reviewSetupId)
    .where('_deleted', '=', false)
    .returningAll()
    .executeTakeFirst()
}

const fetchActiveReviewSetupMembers = async (
  db: Kysely<Database>,
  reviewSetupId: string
): Promise<ReviewSetupMemberRow[]> => {
  return await db
    .selectFrom('Common_Review_Setup')
    .innerJoin('Common_Review_Schema', 'Common_Review_Schema.id', 'Common_Review_Setup.egcs_cn_reviewschema')
    .innerJoin('Common_Publication as Review_Schema_Publication', 'Review_Schema_Publication.id', 'Common_Review_Schema.id')
    .leftJoin('Common_Publication_Version as Review_Schema_Version', 'Review_Schema_Version.id', 'Review_Schema_Publication.egcs_cn_currentversion')
    .select(reviewSetupMemberSelectFields)
    .where('Common_Review_Setup.egcs_cn_reviewset', '=', reviewSetupId)
    .where('Common_Review_Setup._deleted', '=', false)
    .where('Common_Review_Schema._deleted', '=', false)
    .orderBy('Common_Review_Setup.egcs_cn_order', 'asc')
    .execute()
}

const fetchReviewSetupMembersByIds = async (
  db: Kysely<Database>,
  memberIds: string[]
): Promise<ReviewSetupMemberRow[]> => {
  if (memberIds.length === 0) {
    return []
  }

  return await db
    .selectFrom('Common_Review_Setup')
    .innerJoin('Common_Review_Schema', 'Common_Review_Schema.id', 'Common_Review_Setup.egcs_cn_reviewschema')
    .innerJoin('Common_Publication as Review_Schema_Publication', 'Review_Schema_Publication.id', 'Common_Review_Schema.id')
    .leftJoin('Common_Publication_Version as Review_Schema_Version', 'Review_Schema_Version.id', 'Review_Schema_Publication.egcs_cn_currentversion')
    .select(reviewSetupMemberSelectFields)
    .where('Common_Review_Setup.id', 'in', memberIds)
    .where('Common_Review_Schema._deleted', '=', false)
    .orderBy('Common_Review_Setup.egcs_cn_order', 'asc')
    .execute()
}

const buildReviewSetupMemberInsertPayload = (
  reviewSetupId: string,
  entityType: ReviewSetSetupRow['egcs_cn_entitytype'],
  members: ReviewSetupMember[]
): ReviewSetupInsertPayload[] => {
  return members.map(member => ({
    egcs_cn_entitytype: entityType,
    egcs_cn_order: member.egcs_cn_order,
    egcs_cn_reviewset: reviewSetupId,
    egcs_cn_approvaltemplate: member.egcs_cn_approvaltemplate,
    egcs_cn_failonchecklistfailure: member.egcs_cn_failonchecklistfailure,
    egcs_cn_failurethreshold: member.egcs_cn_failurethreshold,
    egcs_cn_reviewschema: member.egcs_cn_reviewschema,
    _deleted: false
  }))
}

const replaceReviewSetupMembers = async (
  db: Kysely<Database>,
  reviewSetupId: string,
  body: ReviewSetupPatchBody,
  currentSet: ReviewSetSetupRow
): Promise<ReviewSetupMemberRow[]> => {
  if (body.members === undefined) {
    if (
      body.egcs_cn_entitytype !== undefined
      && body.egcs_cn_entitytype !== currentSet.egcs_cn_entitytype
    ) {
      await db
        .updateTable('Common_Review_Setup')
        .set({ egcs_cn_entitytype: body.egcs_cn_entitytype })
        .where('egcs_cn_reviewset', '=', reviewSetupId)
        .where('_deleted', '=', false)
        .execute()
    }

    return await fetchActiveReviewSetupMembers(db, reviewSetupId)
  }

  await db
    .updateTable('Common_Review_Setup')
    .set({ _deleted: true })
    .where('egcs_cn_reviewset', '=', reviewSetupId)
    .where('_deleted', '=', false)
    .execute()

  if (body.members.length === 0) {
    return []
  }

  const insertedMembers = await db
    .insertInto('Common_Review_Setup')
    .values(buildReviewSetupMemberInsertPayload(
      reviewSetupId,
      resolveReviewSetupEntityType(body, currentSet),
      body.members
    ))
    .returning(['id', 'egcs_cn_reviewset', 'egcs_cn_reviewschema', 'egcs_cn_order', 'egcs_cn_approvaltemplate', 'egcs_cn_failonchecklistfailure', 'egcs_cn_failurethreshold', '_deleted'])
    .execute()
  const insertedIds = insertedMembers.map(member => String(member.id))

  return await fetchReviewSetupMembersByIds(db, insertedIds)
}

const mapReviewSetupPatchResponse = async (
  db: Kysely<Database>,
  updatedSet: ReviewSetSetupRow,
  members: ReviewSetupMemberRow[]
) => {
  return {
    id: String(updatedSet.id),
    egcs_cn_entitytype: updatedSet.egcs_cn_entitytype,
    egcs_cn_name_en: updatedSet.egcs_cn_name_en,
    egcs_cn_name_fr: updatedSet.egcs_cn_name_fr,
    egcs_cn_order: updatedSet.egcs_cn_order,
    egcs_cn_sequential: updatedSet.egcs_cn_sequential,
    egcs_cn_approvaltemplate: updatedSet.egcs_cn_approvaltemplate
      ? String(updatedSet.egcs_cn_approvaltemplate)
      : undefined,
    _deleted: updatedSet._deleted,
    members: mapReviewSetupMembers(members),
    ...await readReviewSetupPublicationMetadata(db, updatedSet)
  }
}

export const patchTransferPaymentReviewSetup = async (
  event: H3Event,
  db: Kysely<Database>,
  options: PatchTransferPaymentReviewSetupOptions
) => {
  const currentSet = await findReviewSetup(db, options.streamId, options.reviewSetupId)
  if (!currentSet) {
    return await notFound(event, 'REVIEW_SETUP_NOT_FOUND', 'apiErrors.transfer_payment.review_setup_not_found')
  }
  if (currentSet.publicationState === 'retired') {
    return await throwApiError(event, {
      statusCode: 409, code: 'PUBLICATION_RETIRED', key: 'apiErrors.request.invalid_status'
    })
  }

  const validationError = await validateReviewSetupPatch(event, db, options, currentSet)
  if (validationError) return validationError

  const updatedSet = await updateReviewSetupSet(db, options.reviewSetupId, options.body, currentSet)
  if (!updatedSet) {
    return await notFound(event, 'REVIEW_SETUP_NOT_FOUND', 'apiErrors.transfer_payment.review_setup_not_found')
  }
  const members = await replaceReviewSetupMembers(db, options.reviewSetupId, options.body, currentSet)

  return await mapReviewSetupPatchResponse(db, updatedSet, members)
}
