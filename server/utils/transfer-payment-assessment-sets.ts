/* eslint-disable jsdoc/require-jsdoc -- Assessment-set helpers expose typed contracts covered by route tests. */
import type { H3Event } from 'h3'
import type { Kysely } from 'kysely'
import { badRequest, notFound } from './api-errors'
import { readValidatedBodyI18n } from './api-validate'
import type { Database, Entity_Type } from '~~/shared/types/database'
import {
  TransferPaymentAssessmentSetItemPatchSchema,
  TransferPaymentAssessmentSetPatchSchema
} from '~~/shared/types/schemas'
import type {
  TransferPaymentAssessmentSet,
  TransferPaymentAssessmentSetMember
} from '~~/shared/types/schemas/transfer-payment'
import { authorize } from './authorize'
import { validateApprovalTemplateForScope } from './transfer-payment-polymorphic'
import type { TransferPaymentAmendmentTypeScopeContext } from './transfer-payment-amendment-types'
import { readReviewSetupPublicationMetadata } from './review-setup-versioning'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

type TransferPaymentAssessmentSetItemPatch = Partial<TransferPaymentAssessmentSetMember> & {
  _deleted?: boolean
}

type TransferPaymentAssessmentSetPatch = Partial<TransferPaymentAssessmentSet> & {
  _deleted?: boolean
}

export const authorizeTransferPaymentStreamAction = async (
  event: H3Event,
  action: 'create' | 'read' | 'update' | 'delete',
  streamContext: TransferPaymentAmendmentTypeScopeContext,
  _db: Kysely<Database>
) => {
  await authorize(event, 'transfer_payment', action, async ({ context }) => {
    const canAccess = context.userAbilities.authorize(
      'transfer_payment',
      action,
      streamContext.scope
    )
    if (canAccess) {
      return { bypass: true }
    }

    return { scope: streamContext.scope }
  })
}

export const validateAssessmentReviewSchemasForAgency = async (
  db: Kysely<Database>,
  agencyId: string,
  reviewSchemaTargets: string[] | Array<{ entityType: Entity_Type; schemaId: string }>
) => {
  if (reviewSchemaTargets.length === 0) {
    return false
  }

  if (typeof reviewSchemaTargets[0] === 'string') {
    const uniqueReviewSchemaIds = Array.from(new Set(reviewSchemaTargets as string[]))
    const reviewSchemas = await db
      .selectFrom('Common_Review_Schema')
      .select('id')
      .where('id', 'in', uniqueReviewSchemaIds)
      .where('egcs_cn_agency', '=', agencyId)
      .where('egcs_cn_reviewtype', '=', 'assessment')
      .where('_deleted', '=', false)
      .execute()

    return reviewSchemas.length === uniqueReviewSchemaIds.length
  }

  const uniqueTargets = Array.from(
    new Map(
      (reviewSchemaTargets as Array<{ entityType: Entity_Type; schemaId: string }>)
        .map(target => [`${target.entityType}:${target.schemaId}`, target])
    ).values()
  )
  const schemaIds = uniqueTargets.map(target => target.schemaId)
  const reviewSchemas = await db
    .selectFrom('Common_Review_Schema')
    .select(['id', 'egcs_cn_entitytype'])
    .where('id', 'in', schemaIds)
    .where('egcs_cn_agency', '=', agencyId)
    .where('egcs_cn_reviewtype', '=', 'assessment')
    .where('_deleted', '=', false)
    .execute()

  const validTargets = new Set(reviewSchemas.map(schema => `${schema.egcs_cn_entitytype}:${String(schema.id)}`))
  return uniqueTargets.every(target => validTargets.has(`${target.entityType}:${target.schemaId}`))
}

export const fetchAssessmentSetForStream = async (
  db: Kysely<Database>,
  streamId: string,
  assessmentSetId: string
) => {
  if (!isPositivePostgresBigintText(assessmentSetId)) return undefined
  return await db.selectFrom('Common_Review_Set_Setup')
    .selectAll()
    .where('id', '=', assessmentSetId)
    .where('egcs_cn_scopetype', '=', 'transferpaymentstream')
    .where('egcs_cn_scopeid', '=', streamId)
    .where('_deleted', '=', false)
    .executeTakeFirst()
}

export const fetchAssessmentSetItemForStream = async (
  db: Kysely<Database>,
  streamId: string,
  assessmentSetId: string,
  assessmentSetItemId: string
) => {
  if (!isPositivePostgresBigintText(assessmentSetId) || !isPositivePostgresBigintText(assessmentSetItemId)) return undefined
  return await db.selectFrom('Common_Review_Setup')
    .innerJoin('Common_Review_Set_Setup', 'Common_Review_Set_Setup.id', 'Common_Review_Setup.egcs_cn_reviewset')
    .select([
      'Common_Review_Setup.id as id',
      'Common_Review_Setup.egcs_cn_reviewset as egcs_cn_reviewset',
      'Common_Review_Setup.egcs_cn_order as egcs_cn_order',
      'Common_Review_Setup.egcs_cn_approvaltemplate as egcs_cn_approvaltemplate',
      'Common_Review_Setup.egcs_cn_reviewschema as egcs_cn_reviewschema',
      'Common_Review_Setup.egcs_cn_entitytype as egcs_cn_entitytype',
      'Common_Review_Setup._deleted as _deleted'
    ])
    .where('Common_Review_Setup.id', '=', assessmentSetItemId)
    .where('Common_Review_Setup.egcs_cn_reviewset', '=', assessmentSetId)
    .where('Common_Review_Setup._deleted', '=', false)
    .where('Common_Review_Set_Setup.egcs_cn_scopetype', '=', 'transferpaymentstream')
    .where('Common_Review_Set_Setup.egcs_cn_scopeid', '=', streamId)
    .where('Common_Review_Set_Setup._deleted', '=', false)
    .executeTakeFirst()
}

export const fetchAssessmentReviewSchemaForAgency = async (
  db: Kysely<Database>,
  agencyId: string,
  schemaId: string,
  forUpdate = false
) => {
  if (!isPositivePostgresBigintText(schemaId)) return undefined
  const query = db.selectFrom('Common_Review_Schema')
    .selectAll()
    .where('id', '=', schemaId)
    .where('egcs_cn_agency', '=', agencyId)
    .where('egcs_cn_reviewtype', '=', 'assessment')
    .where('_deleted', '=', false)
  return await (forUpdate ? query.forUpdate() : query).executeTakeFirst()
}

/**
 * Rejects mutation of a retired legacy Assessment Set publication.
 * @param event Request event.
 * @param db Locked transaction.
 * @param assessmentSetId Assessment Set identifier.
 * @returns Nothing when mutable; otherwise throws a localized conflict.
 */
export const assertMutableAssessmentSet = async (event: H3Event, db: Kysely<Database>, assessmentSetId: string) => {
  const publication = await db.selectFrom('Common_Publication')
    .select('egcs_cn_state')
    .where('id', '=', assessmentSetId)
    .forUpdate()
    .executeTakeFirst()
  if (publication?.egcs_cn_state === 'retired') {
    return await throwApiError(event, {
      statusCode: 409, code: 'PUBLICATION_RETIRED', key: 'apiErrors.request.invalid_status'
    })
  }
}

const readAssessmentSetItemPatchBody = async (event: H3Event) => {
  const bodyReader = (globalThis as typeof globalThis & {
    readValidatedBodyI18n?: typeof readValidatedBodyI18n
  }).readValidatedBodyI18n ?? readValidatedBodyI18n

  return await bodyReader(event, TransferPaymentAssessmentSetItemPatchSchema)
}

const readAssessmentSetPatchBody = async (event: H3Event) => {
  const bodyReader = (globalThis as typeof globalThis & {
    readValidatedBodyI18n?: typeof readValidatedBodyI18n
  }).readValidatedBodyI18n ?? readValidatedBodyI18n

  return await bodyReader(event, TransferPaymentAssessmentSetPatchSchema)
}

const validateAssessmentSetPatchBody = async (
  event: H3Event,
  db: Kysely<Database>,
  streamId: string,
  assessmentSetId: string,
  currentSet: { egcs_cn_entitytype: Entity_Type, egcs_cn_approvaltemplate?: string | number | null },
  body: TransferPaymentAssessmentSetPatch
) => {
  if (body.egcs_cn_approvaltemplate === undefined && body.egcs_cn_entitytype === undefined) {
    return null
  }

  const targetApprovalTemplate = body.egcs_cn_approvaltemplate !== undefined
    ? body.egcs_cn_approvaltemplate
    : currentSet.egcs_cn_approvaltemplate
  const hasValidApprovalTemplate = await validateApprovalTemplateForScope(
    db,
    streamId,
    targetApprovalTemplate ? String(targetApprovalTemplate) : undefined
  )

  if (!hasValidApprovalTemplate) {
    return await badRequest(event, 'APPROVAL_TEMPLATE_NOT_FOUND', 'apiErrors.transfer_payment.approval_template_not_found')
  }

  if (body.egcs_cn_entitytype !== undefined && body.egcs_cn_entitytype !== currentSet.egcs_cn_entitytype) {
    const incompatibleMember = await db.selectFrom('Common_Review_Setup')
      .innerJoin('Common_Review_Schema', 'Common_Review_Schema.id', 'Common_Review_Setup.egcs_cn_reviewschema')
      .select('Common_Review_Setup.id')
      .where('Common_Review_Setup.egcs_cn_reviewset', '=', assessmentSetId)
      .where('Common_Review_Setup._deleted', '=', false)
      .where('Common_Review_Schema._deleted', '=', false)
      .where('Common_Review_Schema.egcs_cn_entitytype', '!=', body.egcs_cn_entitytype)
      .forUpdate()
      .executeTakeFirst()
    if (incompatibleMember) {
      return await badRequest(event, 'REVIEW_SCHEMA_NOT_FOUND', 'apiErrors.transfer_payment.review_schema_not_found')
    }
  }

  return null
}

const ASSESSMENT_SET_PATCH_FIELDS = [
  'egcs_cn_entitytype',
  'egcs_cn_name_en',
  'egcs_cn_name_fr',
  'egcs_cn_description_en',
  'egcs_cn_description_fr',
  'egcs_cn_order',
  'egcs_cn_sequential',
  'egcs_cn_approvaltemplate',
  '_deleted'
] satisfies readonly (keyof TransferPaymentAssessmentSetPatch)[]

const buildAssessmentSetUpdatePayload = (
  body: TransferPaymentAssessmentSetPatch
): Record<string, unknown> => {
  const updatePayload: Record<string, unknown> = {}
  for (const field of ASSESSMENT_SET_PATCH_FIELDS) {
    const value = body[field]
    if (value !== undefined) updatePayload[field] = value
  }
  return updatePayload
}

const formatAssessmentSetResponse = async (
  db: Kysely<Database>,
  updated: NonNullable<Awaited<ReturnType<typeof fetchAssessmentSetForStream>>>
) => ({
  id: String(updated.id),
  egcs_cn_entitytype: updated.egcs_cn_entitytype,
  egcs_cn_name_en: updated.egcs_cn_name_en,
  egcs_cn_name_fr: updated.egcs_cn_name_fr,
  egcs_cn_order: updated.egcs_cn_order,
  egcs_cn_sequential: updated.egcs_cn_sequential,
  egcs_cn_approvaltemplate: updated.egcs_cn_approvaltemplate != null
    ? String(updated.egcs_cn_approvaltemplate)
    : undefined,
  _deleted: updated._deleted,
  ...await readReviewSetupPublicationMetadata(db, updated)
})

export const patchAssessmentSetForStream = async (
  event: H3Event,
  db: Kysely<Database>,
  streamId: string,
  assessmentSetId: string
) => {
  await assertMutableAssessmentSet(event, db, assessmentSetId)
  const currentSet = await fetchAssessmentSetForStream(db, streamId, assessmentSetId)
  if (!currentSet) {
    return await notFound(event, 'ASSESSMENT_SET_NOT_FOUND', 'apiErrors.transfer_payment.review_setup_not_found')
  }

  const body = await readAssessmentSetPatchBody(event)
  const validationError = await validateAssessmentSetPatchBody(
    event,
    db,
    streamId,
    assessmentSetId,
    currentSet,
    body
  )
  if (validationError) {
    return validationError
  }

  const updatePayload = buildAssessmentSetUpdatePayload(body)
  const updated = Object.keys(updatePayload).length === 0
    ? currentSet
    : await db
        .updateTable('Common_Review_Set_Setup')
        .set(updatePayload)
        .where('id', '=', assessmentSetId)
        .where('_deleted', '=', false)
        .returningAll()
        .executeTakeFirst()

  if (!updated) {
    return await notFound(event, 'ASSESSMENT_SET_NOT_FOUND', 'apiErrors.transfer_payment.review_setup_not_found')
  }

  return await formatAssessmentSetResponse(db, updated)
}

const validateAssessmentSetItemPatchBody = async (
  event: H3Event,
  db: Kysely<Database>,
  streamId: string,
  agencyId: string,
  entityType: Entity_Type,
  body: TransferPaymentAssessmentSetItemPatch
) => {
  if (body.egcs_cn_reviewschema !== undefined) {
    const hasValidSchema = await validateAssessmentReviewSchemasForAgency(
      db,
      agencyId,
      [{ entityType, schemaId: String(body.egcs_cn_reviewschema) }]
    )
    if (!hasValidSchema) {
      return await badRequest(event, 'REVIEW_SCHEMA_NOT_FOUND', 'apiErrors.transfer_payment.review_schema_not_found')
    }
  }

  if (body.egcs_cn_approvaltemplate !== undefined) {
    const hasValidApprovalTemplate = await validateApprovalTemplateForScope(
      db,
      streamId,
      body.egcs_cn_approvaltemplate
    )

    if (!hasValidApprovalTemplate) {
      return await badRequest(event, 'APPROVAL_TEMPLATE_NOT_FOUND', 'apiErrors.transfer_payment.approval_template_not_found')
    }
  }

  return null
}

const buildAssessmentSetItemUpdatePayload = (
  body: TransferPaymentAssessmentSetItemPatch
): Record<string, unknown> => {
  const updatePayload: Record<string, unknown> = {}
  if (body.egcs_cn_order !== undefined) updatePayload.egcs_cn_order = body.egcs_cn_order
  if (body.egcs_cn_approvaltemplate !== undefined) updatePayload.egcs_cn_approvaltemplate = body.egcs_cn_approvaltemplate
  if (body.egcs_cn_reviewschema !== undefined) updatePayload.egcs_cn_reviewschema = body.egcs_cn_reviewschema
  if (body._deleted !== undefined) updatePayload._deleted = body._deleted
  return updatePayload
}

const fetchAssessmentSetItemResponseSchema = async (
  db: Kysely<Database>,
  schemaId: string
) => await db
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
  .where('id', '=', schemaId)
  .executeTakeFirstOrThrow()

const formatAssessmentSetItemResponse = async (
  db: Kysely<Database>,
  updated: Record<string, unknown>,
  currentItem: Record<string, unknown>
) => {
  const schemaId = String(updated.egcs_cn_reviewschema ?? currentItem.egcs_cn_reviewschema)
  const schema = await fetchAssessmentSetItemResponseSchema(db, schemaId)

  return {
    id: String(updated.id),
    egcs_cn_order: updated.egcs_cn_order ?? currentItem.egcs_cn_order,
    egcs_cn_approvaltemplate: updated.egcs_cn_approvaltemplate != null
      ? String(updated.egcs_cn_approvaltemplate)
      : undefined,
    egcs_cn_reviewschema: schemaId,
    egcs_cn_disablecustomoutcomes: schema.egcs_cn_disablecustomoutcomes,
    egcs_cn_disablealignment: schema.egcs_cn_disablealignment,
    egcs_cn_disablereviewers: schema.egcs_cn_disablereviewers,
    _deleted: updated._deleted ?? currentItem._deleted,
    egcs_cn_name_en: schema.egcs_cn_name_en,
    egcs_cn_name_fr: schema.egcs_cn_name_fr,
    egcs_cn_outcomename_en: schema.egcs_cn_outcomename_en,
    egcs_cn_outcomename_fr: schema.egcs_cn_outcomename_fr,
    publicationId: schemaId,
    publicationState: schema.publicationState,
    publicationVersionId: schema.publicationVersionId === null ? null : String(schema.publicationVersionId),
    publicationVersion: schema.publicationVersion === null ? null : Number(schema.publicationVersion)
  }
}

export const patchAssessmentSetItemForStream = async (
  event: H3Event,
  db: Kysely<Database>,
  streamId: string,
  assessmentSetId: string,
  itemId: string,
  agencyId: string
) => {
  await assertMutableAssessmentSet(event, db, assessmentSetId)
  const parentSet = await fetchAssessmentSetForStream(db, streamId, assessmentSetId)
  if (!parentSet) {
    return await notFound(event, 'ASSESSMENT_SET_NOT_FOUND', 'apiErrors.transfer_payment.review_setup_not_found')
  }

  const currentItem = await fetchAssessmentSetItemForStream(db, streamId, assessmentSetId, itemId)
  if (!currentItem) {
    return await notFound(event, 'ASSESSMENT_SET_ITEM_NOT_FOUND', 'apiErrors.transfer_payment.review_schema_not_found')
  }

  const body = await readAssessmentSetItemPatchBody(event)
  const validationError = await validateAssessmentSetItemPatchBody(
    event,
    db,
    streamId,
    agencyId,
    parentSet.egcs_cn_entitytype,
    body
  )
  if (validationError) {
    return validationError
  }

  const updatePayload = buildAssessmentSetItemUpdatePayload(body)
  const updated = Object.keys(updatePayload).length === 0
    ? currentItem
    : await db
        .updateTable('Common_Review_Setup')
        .set(updatePayload)
        .where('id', '=', itemId)
        .where('egcs_cn_reviewset', '=', assessmentSetId)
        .where('_deleted', '=', false)
        .returningAll()
        .executeTakeFirst()

  if (!updated) {
    return await notFound(event, 'ASSESSMENT_SET_ITEM_NOT_FOUND', 'apiErrors.transfer_payment.review_schema_not_found')
  }

  return await formatAssessmentSetItemResponse(db, updated, currentItem)
}
