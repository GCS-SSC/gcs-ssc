/* eslint-disable jsdoc/require-jsdoc -- route helper contracts are covered by route tests */
import type { Kysely, Transaction } from 'kysely'
import type { Database, JsonValue } from '~~/shared/types/database'
import { ChecklistDefinitionSchema, type ChecklistDefinition } from '~~/shared/types/schemas/checklist/checklist'
import { buildReviewSchemaDefinition, mapReviewSchemaPublication } from './review-schema-versioning'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export const DEFAULT_CHECKLIST_DEFINITION = ChecklistDefinitionSchema.parse({
  sections: [{
    key: 'section-1',
    label: { en: 'Section 1', fr: 'Section 1' },
    questions: [{
      key: 'question-1',
      question: { en: 'New question', fr: 'Nouvelle question' },
      required: true,
      commentPolicy: 'optional'
    }]
  }],
  resultPolicy: { anyFailureFails: true, groups: [] }
})

export const fetchChecklistReviewSchemaForAgency = async (
  db: Kysely<Database>,
  agencyId: string,
  schemaId: string,
  forUpdate = false
) => {
  if (!isPositivePostgresBigintText(schemaId)) return undefined
  const query = db.selectFrom('Common_Review_Schema')
    .innerJoin('Common_Checklist_Schema', 'Common_Checklist_Schema.egcs_cn_reviewschema', 'Common_Review_Schema.id')
    .select([
      'Common_Review_Schema.id', 'Common_Review_Schema.egcs_cn_agency',
      'Common_Review_Schema.egcs_cn_entitytype', 'Common_Review_Schema.egcs_cn_reviewtype',
      'Common_Review_Schema.egcs_cn_name_en',
      'Common_Review_Schema.egcs_cn_name_fr', 'Common_Review_Schema.egcs_cn_outcomename_en',
      'Common_Review_Schema.egcs_cn_outcomename_fr', 'Common_Review_Schema.egcs_cn_disablereviewers',
      'Common_Review_Schema.egcs_cn_disablecustomoutcomes', 'Common_Review_Schema.egcs_cn_disablealignment',
      'Common_Review_Schema.egcs_cn_scoringmatrix', 'Common_Review_Schema.egcs_cn_assessmentschema',
      'Common_Checklist_Schema.id as checklist_schema_id',
      'Common_Checklist_Schema.egcs_cn_checklistschema'
    ])
    .where('Common_Review_Schema.id', '=', schemaId)
    .where('Common_Review_Schema.egcs_cn_agency', '=', agencyId)
    .where('Common_Review_Schema.egcs_cn_reviewtype', '=', 'checklist')
    .where('Common_Review_Schema._deleted', '=', false)
    .where('Common_Checklist_Schema._deleted', '=', false)

  return await (forUpdate ? query.forUpdate('Common_Review_Schema') : query).executeTakeFirst()
}

export const getEffectiveChecklistDefinition = (schema: {
  egcs_cn_checklistschema?: JsonValue | null
}) => ChecklistDefinitionSchema.parse(
  schema.egcs_cn_checklistschema ?? DEFAULT_CHECKLIST_DEFINITION
)

export const mapChecklistSchema = async (
  db: Kysely<Database> | Transaction<Database>,
  schema: NonNullable<Awaited<ReturnType<typeof fetchChecklistReviewSchemaForAgency>>>
) => ({
  id: String(schema.id),
  egcs_cn_agency: String(schema.egcs_cn_agency),
  egcs_cn_reviewtype: schema.egcs_cn_reviewtype,
  egcs_cn_entitytype: schema.egcs_cn_entitytype,
  egcs_cn_name_en: schema.egcs_cn_name_en,
  egcs_cn_name_fr: schema.egcs_cn_name_fr,
  egcs_cn_outcomename_en: schema.egcs_cn_outcomename_en,
  egcs_cn_outcomename_fr: schema.egcs_cn_outcomename_fr,
  egcs_cn_disablereviewers: schema.egcs_cn_disablereviewers,
  egcs_cn_checklistschema: getEffectiveChecklistDefinition(schema),
  ...await mapReviewSchemaPublication(db, schema, getEffectiveChecklistDefinition(schema) as unknown as JsonValue)
})

export const buildChecklistReviewSchemaDefinition = (
  schema: NonNullable<Awaited<ReturnType<typeof fetchChecklistReviewSchemaForAgency>>>,
  definition: ChecklistDefinition = getEffectiveChecklistDefinition(schema)
) => buildReviewSchemaDefinition(schema, definition as unknown as JsonValue)
