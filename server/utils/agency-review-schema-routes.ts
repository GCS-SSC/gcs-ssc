/* eslint-disable jsdoc/require-jsdoc -- Agency Review Schema route adapter. */
import type { H3Event } from 'h3'
import { sql } from 'kysely'
import { z } from 'zod'
import type { JsonValue } from '~~/shared/types/database'
import { AgencyReviewSchemaCreateSchema, AssessmentReviewSchemaPatchSchema, createAssessmentReviewSchemaPatchSchema } from '~~/shared/types/schemas'
import { ChecklistDefinitionSchema } from '~~/shared/types/schemas/checklist/checklist'
import { authorize } from './authorize'
import { notFound, throwApiError } from './api-errors'
import { parseI18n, readValidatedBodyI18n } from './api-validate'
import { withActiveAgencyMutationTransaction, withActiveAgencyReadTransaction } from './agency-auth'
import { resolveCurrentCommonUser } from './additional-reviewer-runtime'
import { fetchAssessmentReviewSchemaForAgency } from './transfer-payment-assessment-sets'
import { buildReviewSchemaDefinition, mapAssessmentReviewSchema } from './review-schema-versioning'
import { DEFAULT_CHECKLIST_DEFINITION, buildChecklistReviewSchemaDefinition, fetchChecklistReviewSchemaForAgency, mapChecklistSchema } from './transfer-payment-checklist-schemas'
import { publishDefinition, retirePublication } from './system-publication'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

const EMPTY_ASSESSMENT_DEFINITION = { sections: [], sectionMatrix: [], outcomes: [] }
const CreateSchema = AgencyReviewSchemaCreateSchema.extend({
  egcs_cn_scoringmatrix: z.array(z.unknown()).optional(),
  egcs_cn_assessmentschema: z.record(z.string(), z.unknown()).optional(),
  egcs_cn_checklistschema: ChecklistDefinitionSchema.optional(),
  egcs_cn_disablecustomoutcomes: z.boolean().optional().default(false),
  egcs_cn_disablealignment: z.boolean().optional().default(false),
  egcs_cn_disablereviewers: z.boolean().optional().default(false)
}).strict()
const ChecklistPatchSchema = z.object({
  egcs_cn_name_en: z.string().trim().min(1).optional(),
  egcs_cn_name_fr: z.string().trim().min(1).optional(),
  egcs_cn_outcomename_en: z.string().trim().min(1).optional(),
  egcs_cn_outcomename_fr: z.string().trim().min(1).optional(),
  egcs_cn_disablereviewers: z.boolean().optional(),
  egcs_cn_checklistschema: ChecklistDefinitionSchema.optional()
}).strict()

export const agencyReviewSchemaRoute = async (event: H3Event, action: 'create' | 'read' | 'update' | 'publish' | 'retire' | 'delete') => {
  const agencyId = getRouterParam(event, 'agencyId') ?? ''
  const schemaId = getRouterParam(event, 'schemaId') ?? ''
  if (!isPositivePostgresBigintText(agencyId)) return await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found')
  if (action !== 'create' && !isPositivePostgresBigintText(schemaId)) {
    return await notFound(event, 'REVIEW_SCHEMA_NOT_FOUND', 'apiErrors.transfer_payment.review_schema_not_found')
  }
  await authorize(event, 'agency', action === 'read' ? 'read' : 'update', { type: 'agency', agencyId })
  if (action === 'create') {
    const body = await readValidatedBodyI18n(event, CreateSchema)
    return await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
      const isChecklist = body.egcs_cn_reviewtype === 'checklist'
      const schema = await trx.insertInto('Common_Review_Schema').values({
        egcs_cn_agency: agencyId,
        egcs_cn_reviewtype: body.egcs_cn_reviewtype,
        egcs_cn_entitytype: body.egcs_cn_entitytype,
        egcs_cn_name_en: body.egcs_cn_name_en,
        egcs_cn_name_fr: body.egcs_cn_name_fr,
        egcs_cn_outcomename_en: body.egcs_cn_outcomename_en,
        egcs_cn_outcomename_fr: body.egcs_cn_outcomename_fr,
        egcs_cn_disablecustomoutcomes: isChecklist || body.egcs_cn_disablecustomoutcomes,
        egcs_cn_disablealignment: isChecklist || body.egcs_cn_disablealignment,
        egcs_cn_disablereviewers: body.egcs_cn_disablereviewers,
        egcs_cn_scoringmatrix: isChecklist ? null : (body.egcs_cn_scoringmatrix ?? []) as JsonValue,
        egcs_cn_assessmentschema: isChecklist ? null : (body.egcs_cn_assessmentschema ?? EMPTY_ASSESSMENT_DEFINITION) as JsonValue,
        _deleted: false
      }).returningAll().executeTakeFirstOrThrow()
      if (isChecklist) {
        await trx.insertInto('Common_Checklist_Schema').values({ egcs_cn_reviewschema: String(schema.id), egcs_cn_checklistschema: (body.egcs_cn_checklistschema ?? DEFAULT_CHECKLIST_DEFINITION) as unknown as JsonValue, _deleted: false }).execute()
      } else {
        await trx.insertInto('Common_Assessment_Schema').values({
          egcs_cn_reviewschema: String(schema.id), egcs_cn_scoringmatrix: (body.egcs_cn_scoringmatrix ?? []) as JsonValue,
          egcs_cn_assessmentschema: (body.egcs_cn_assessmentschema ?? EMPTY_ASSESSMENT_DEFINITION) as JsonValue,
          egcs_cn_outcomename_en: body.egcs_cn_outcomename_en, egcs_cn_outcomename_fr: body.egcs_cn_outcomename_fr,
          egcs_cn_disablecustomoutcomes: body.egcs_cn_disablecustomoutcomes,
          egcs_cn_disablealignment: body.egcs_cn_disablealignment, _deleted: false
        }).execute()
      }
      return isChecklist
        ? await mapChecklistSchema(trx, (await fetchChecklistReviewSchemaForAgency(trx, agencyId, String(schema.id)))!)
        : await mapAssessmentReviewSchema(trx, schema)
    })
  }

  if (action === 'read') return await withActiveAgencyReadTransaction(event, agencyId, async trx => {
    const schema = await trx.selectFrom('Common_Review_Schema').select(['egcs_cn_reviewtype'])
      .where('id', '=', schemaId).where('egcs_cn_agency', '=', agencyId).where('_deleted', '=', false).executeTakeFirst()
    if (!schema) return await notFound(event, 'REVIEW_SCHEMA_NOT_FOUND', 'apiErrors.transfer_payment.review_schema_not_found')
    if (schema.egcs_cn_reviewtype === 'checklist') {
      const row = await fetchChecklistReviewSchemaForAgency(trx, agencyId, schemaId)
      return row ? await mapChecklistSchema(trx, row) : await notFound(event, 'REVIEW_SCHEMA_NOT_FOUND', 'apiErrors.transfer_payment.review_schema_not_found')
    }
    const row = await fetchAssessmentReviewSchemaForAgency(trx, agencyId, schemaId)
    return row ? await mapAssessmentReviewSchema(trx, row) : await notFound(event, 'REVIEW_SCHEMA_NOT_FOUND', 'apiErrors.transfer_payment.review_schema_not_found')
  })

  const patchBody = action === 'update' ? await readValidatedBodyI18n(event, z.union([AssessmentReviewSchemaPatchSchema.strict(), ChecklistPatchSchema])) : null
  return await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
    const schema = await trx.selectFrom('Common_Review_Schema').selectAll()
      .where('id', '=', schemaId).where('egcs_cn_agency', '=', agencyId).where('_deleted', '=', false).forUpdate().executeTakeFirst()
    if (!schema) return await notFound(event, 'REVIEW_SCHEMA_NOT_FOUND', 'apiErrors.transfer_payment.review_schema_not_found')
    const publication = await trx.selectFrom('Common_Publication').select('egcs_cn_state')
      .where('id', '=', schemaId).where('egcs_cn_kind', '=', 'review_schema').forUpdate().executeTakeFirst()
    if (action === 'update') {
      if (publication?.egcs_cn_state === 'retired') return await throwApiError(event, { statusCode: 409, code: 'PUBLICATION_RETIRED', key: 'apiErrors.request.invalid_status' })
      if (schema.egcs_cn_reviewtype === 'checklist') {
        const body = await parseI18n(event, ChecklistPatchSchema, patchBody)
        const { egcs_cn_checklistschema: checklist, ...values } = body
        if (Object.keys(values).length) await trx.updateTable('Common_Review_Schema').set(values).where('id', '=', schemaId).execute()
        const row = await fetchChecklistReviewSchemaForAgency(trx, agencyId, schemaId, true)
        if (!row) return await notFound(event, 'REVIEW_SCHEMA_NOT_FOUND', 'apiErrors.transfer_payment.review_schema_not_found')
        if (checklist) await trx.updateTable('Common_Checklist_Schema').set({ egcs_cn_checklistschema: checklist as unknown as JsonValue }).where('id', '=', String(row.checklist_schema_id)).execute()
        return await mapChecklistSchema(trx, (await fetchChecklistReviewSchemaForAgency(trx, agencyId, schemaId))!)
      }
      const body = await parseI18n(event, createAssessmentReviewSchemaPatchSchema(schema.egcs_cn_entitytype), patchBody)
      const update: Record<string, unknown> = {}
      for (const field of ['egcs_cn_name_en', 'egcs_cn_name_fr', 'egcs_cn_outcomename_en', 'egcs_cn_outcomename_fr', 'egcs_cn_disablecustomoutcomes', 'egcs_cn_disablealignment', 'egcs_cn_disablereviewers', 'egcs_cn_scoringmatrix', 'egcs_cn_assessmentschema'] as const) {
        const value = body[field]
        if (value !== undefined) update[field] = field === 'egcs_cn_scoringmatrix' || field === 'egcs_cn_assessmentschema' ? sql`${JSON.stringify(value)}::jsonb` : value
      }
      const updated = Object.keys(update).length ? await trx.updateTable('Common_Review_Schema').set(update).where('id', '=', schemaId).returningAll().executeTakeFirstOrThrow() : schema
      return await mapAssessmentReviewSchema(trx, updated)
    }
    if (action === 'delete') {
      if (publication?.egcs_cn_state === 'published') return await throwApiError(event, { statusCode: 409, code: 'PUBLICATION_ACTIVE', key: 'apiErrors.request.invalid_status' })
      const inUse = await trx.selectFrom('Common_Review_Setup').select('id')
        .where('egcs_cn_reviewschema', '=', schemaId).where('_deleted', '=', false).forUpdate().executeTakeFirst()
      if (inUse) return await throwApiError(event, { statusCode: 409, code: 'REVIEW_SCHEMA_IN_USE', key: 'apiErrors.request.invalid_resource' })
      await trx.updateTable('Common_Review_Schema').set({ _deleted: true }).where('id', '=', schemaId).execute()
      return { success: true }
    }
    const actor = await resolveCurrentCommonUser(event, trx)
    if (!actor) return await notFound(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')
    if (action === 'retire') {
      return await retirePublication(trx, { publicationId: schemaId, kind: 'review_schema', actorId: actor.id })
    }
    const checklist = schema.egcs_cn_reviewtype === 'checklist'
      ? await fetchChecklistReviewSchemaForAgency(trx, agencyId, schemaId, true)
      : null
    if (schema.egcs_cn_reviewtype === 'checklist' && !checklist) {
      return await notFound(event, 'REVIEW_SCHEMA_NOT_FOUND', 'apiErrors.transfer_payment.review_schema_not_found')
    }
    const definition = checklist ? buildChecklistReviewSchemaDefinition(checklist) : buildReviewSchemaDefinition(schema)
    return await publishDefinition(trx, { publicationId: schemaId, kind: 'review_schema', definition, actorId: actor.id })
  })
}
