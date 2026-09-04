/* eslint-disable jsdoc/require-jsdoc -- typed publication adapter */
import type { Kysely, Selectable, Transaction } from 'kysely'
import type { PublicationMetadata } from './system-publication'
import type { Database, JsonValue } from '~~/shared/types/database'
import { readPublicationMetadata } from './system-publication'

type DbClient = Kysely<Database> | Transaction<Database>
type ReviewSchemaRow = Selectable<Database['Common_Review_Schema']>
type ReviewSchemaDefinitionSource = Pick<ReviewSchemaRow,
  'id' | 'egcs_cn_reviewtype' | 'egcs_cn_agency' | 'egcs_cn_entitytype'
  | 'egcs_cn_name_en' | 'egcs_cn_name_fr' | 'egcs_cn_outcomename_en' | 'egcs_cn_outcomename_fr'
  | 'egcs_cn_disablecustomoutcomes' | 'egcs_cn_disablealignment' | 'egcs_cn_disablereviewers'
  | 'egcs_cn_scoringmatrix' | 'egcs_cn_assessmentschema'>

export type PublishedReviewSchemaDefinition = {
  kind: 'review_schema'
  reviewSchemaId: string
  reviewType: ReviewSchemaRow['egcs_cn_reviewtype']
  agencyId: string
  entityType: ReviewSchemaRow['egcs_cn_entitytype']
  name: { en: string, fr: string }
  outcomeName: { en: string, fr: string }
  disableCustomOutcomes: boolean
  disableAlignment: boolean
  disableReviewers: boolean
  scoringMatrix: JsonValue
  assessmentSchema: JsonValue
  checklistSchema: JsonValue
}

const isBilingualDefinitionName = (value: JsonValue | undefined): value is { en: string, fr: string } =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
  && typeof value.en === 'string' && typeof value.fr === 'string'

export const readPublishedReviewSchema = (value: JsonValue): PublishedReviewSchemaDefinition | null => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  if (value.kind !== 'review_schema'
    || typeof value.reviewSchemaId !== 'string'
    || typeof value.reviewType !== 'string'
    || typeof value.agencyId !== 'string'
    || typeof value.entityType !== 'string'
    || !isBilingualDefinitionName(value.name)
    || !isBilingualDefinitionName(value.outcomeName)
    || typeof value.disableCustomOutcomes !== 'boolean'
    || typeof value.disableAlignment !== 'boolean'
    || typeof value.disableReviewers !== 'boolean'
    || !('scoringMatrix' in value)
    || !('assessmentSchema' in value)
    || !('checklistSchema' in value)) return null
  return value as PublishedReviewSchemaDefinition
}

export type ReviewSchemaContentSource = Pick<
  ReviewSchemaRow,
  'egcs_cn_scoringmatrix' | 'egcs_cn_assessmentschema'
>

export const getReviewSchemaEffectiveContent = (schema: ReviewSchemaContentSource) => ({
  scoringMatrix: schema.egcs_cn_scoringmatrix ?? null,
  assessmentSchema: schema.egcs_cn_assessmentschema ?? null
})

export const buildReviewSchemaDefinition = (
  schema: ReviewSchemaDefinitionSource,
  checklistSchema: JsonValue = null
): PublishedReviewSchemaDefinition => ({
  kind: 'review_schema',
  reviewSchemaId: String(schema.id),
  reviewType: schema.egcs_cn_reviewtype,
  agencyId: String(schema.egcs_cn_agency),
  entityType: schema.egcs_cn_entitytype,
  name: { en: schema.egcs_cn_name_en, fr: schema.egcs_cn_name_fr },
  outcomeName: { en: schema.egcs_cn_outcomename_en, fr: schema.egcs_cn_outcomename_fr },
  disableCustomOutcomes: schema.egcs_cn_disablecustomoutcomes,
  disableAlignment: schema.egcs_cn_disablealignment,
  disableReviewers: schema.egcs_cn_disablereviewers,
  scoringMatrix: schema.egcs_cn_scoringmatrix ?? null,
  assessmentSchema: schema.egcs_cn_assessmentschema ?? null,
  checklistSchema
})

export const mapReviewSchemaPublication = async (
  db: DbClient,
  schema: ReviewSchemaDefinitionSource,
  checklistSchema: JsonValue = null
): Promise<PublicationMetadata> => await readPublicationMetadata(
  db,
  String(schema.id),
  buildReviewSchemaDefinition(schema, checklistSchema) as unknown as JsonValue
)

export const mapAssessmentReviewSchema = async (db: DbClient, schema: ReviewSchemaRow) => ({
  id: String(schema.id),
  egcs_cn_agency: String(schema.egcs_cn_agency),
  egcs_cn_reviewtype: schema.egcs_cn_reviewtype,
  egcs_cn_entitytype: schema.egcs_cn_entitytype,
  egcs_cn_name_en: schema.egcs_cn_name_en,
  egcs_cn_name_fr: schema.egcs_cn_name_fr,
  egcs_cn_outcomename_en: schema.egcs_cn_outcomename_en,
  egcs_cn_outcomename_fr: schema.egcs_cn_outcomename_fr,
  egcs_cn_disablecustomoutcomes: schema.egcs_cn_disablecustomoutcomes,
  egcs_cn_disablealignment: schema.egcs_cn_disablealignment,
  egcs_cn_disablereviewers: schema.egcs_cn_disablereviewers,
  egcs_cn_scoringmatrix: schema.egcs_cn_scoringmatrix,
  egcs_cn_assessmentschema: schema.egcs_cn_assessmentschema,
  ...await mapReviewSchemaPublication(db, schema)
})
