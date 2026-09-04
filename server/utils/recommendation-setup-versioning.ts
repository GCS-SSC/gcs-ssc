/* eslint-disable jsdoc/require-jsdoc -- typed publication primitives */
import type { Kysely, Selectable, Transaction } from 'kysely'
import type { Database, JsonValue } from '~~/shared/types/database'
import { readPublishedApprovalTemplate, type PublishedApprovalTemplate } from './approval-template-versioning'
import {
  readCurrentPublishedDefinition,
  readPublicationMetadata,
  PublishedDefinitionUnavailableError,
  type PublicationMetadata,
  type PublicationVersionReference
} from './system-publication'

type RecommendationSchemaRow = Selectable<Database['Common_Recommendation_Schema']>
type RecommendationSetRow = Selectable<Database['Common_Recommendation_Set_Setup']>
type DbClient = Kysely<Database> | Transaction<Database>

class RecommendationPublicationMissingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RecommendationPublicationMissingError'
  }
}

class RecommendationMemberOrderingError extends Error {
  constructor() {
    super('Recommendation setup members must use contiguous ordering beginning at 1')
    this.name = 'RecommendationMemberOrderingError'
  }
}

export type PublishedRecommendationSchema = {
  schemaId: string
  nameEn: string
  nameFr: string
  result: JsonValue
  definition: JsonValue
}

export type PublishedRecommendationPlan = {
  recommendationSetId: string
  scopeType: RecommendationSetRow['egcs_cn_scopetype']
  scopeId: string
  nameEn: string
  nameFr: string
  descriptionEn: string
  descriptionFr: string
  members: Array<{
    memberId: string
    order: number
    schemaId: string
    schemaVersionId: string
    schemaVersion: number
    schemaNameEn: string
    schemaNameFr: string
    failOnNotRecommended: boolean
    approvalTemplateId?: string
    approvalVersionId?: string
    approvalVersion?: number
    approval?: PublishedApprovalTemplate
  }>
  finalApproval?: {
    publicationId: string
    publicationKind: 'approval_template'
    publicationVersionId: string
    publicationVersion: number
    definition: PublishedApprovalTemplate
  }
}

export type RecommendationPlanPublication = {
  definition: PublishedRecommendationPlan
  references: PublicationVersionReference[]
}

export const lockRecommendationSetupForMutation = async (
  db: DbClient,
  setupId: string,
  streamId: string
) => await db.selectFrom('Common_Recommendation_Set_Setup')
  .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Recommendation_Set_Setup.id')
  .selectAll('Common_Recommendation_Set_Setup')
  .select('Common_Publication.egcs_cn_state as publicationState')
  .where('Common_Recommendation_Set_Setup.id', '=', setupId)
  .where('Common_Recommendation_Set_Setup.egcs_cn_scopetype', '=', 'transferpaymentstream')
  .where('Common_Recommendation_Set_Setup.egcs_cn_scopeid', '=', streamId)
  .where('Common_Recommendation_Set_Setup._deleted', '=', false)
  .where('Common_Publication._deleted', '=', false)
  .forUpdate(['Common_Recommendation_Set_Setup', 'Common_Publication'])
  .executeTakeFirst()

export const buildRecommendationSchemaDefinition = (schema: RecommendationSchemaRow): PublishedRecommendationSchema => ({
  schemaId: String(schema.id),
  nameEn: schema.egcs_cn_name_en,
  nameFr: schema.egcs_cn_name_fr,
  result: schema.egcs_cn_result,
  definition: schema.egcs_cn_recommendationschema
})

export const readPublishedRecommendationSchema = (value: JsonValue): PublishedRecommendationSchema =>
  value as PublishedRecommendationSchema

export const readRecommendationSchemaPublicationMetadata = async (
  db: DbClient,
  schemaId: string
): Promise<PublicationMetadata> => {
  const schema = await db.selectFrom('Common_Recommendation_Schema').selectAll()
    .where('id', '=', schemaId)
    .where('_deleted', '=', false)
    .executeTakeFirstOrThrow()
  return await readPublicationMetadata(db, schemaId, buildRecommendationSchemaDefinition(schema))
}

const resolvePublishedApproval = async (
  db: DbClient,
  templateId?: string | null
): Promise<{
  publicationId: string
  publicationVersionId: string
  publicationVersion: number
  definition: PublishedApprovalTemplate
} | undefined> => {
  if (!templateId) return undefined
  try {
    const published = await readCurrentPublishedDefinition(db, templateId, 'approval_template')
    return { ...published, definition: readPublishedApprovalTemplate(published.definition) }
  } catch (error) {
    if (!(error instanceof PublishedDefinitionUnavailableError)) throw error
    throw new RecommendationPublicationMissingError(`Approval template ${templateId} must be published first`)
  }
}

const resolvePublishedRecommendationSchema = async (db: DbClient, schemaId: string) => {
  try {
    const published = await readCurrentPublishedDefinition(db, schemaId, 'recommendation_schema')
    return { ...published, definition: readPublishedRecommendationSchema(published.definition) }
  } catch (error) {
    if (!(error instanceof PublishedDefinitionUnavailableError)) throw error
    throw new RecommendationPublicationMissingError(`Recommendation schema ${schemaId} must be published first`)
  }
}

export const buildRecommendationPlanPublication = async (
  db: DbClient,
  setup: RecommendationSetRow
): Promise<RecommendationPlanPublication> => {
  const members = await db.selectFrom('Common_Recommendation_Setup')
    .select([
      'id', 'egcs_cn_order', 'egcs_cn_recommendationschema', 'egcs_cn_approvaltemplate',
      'egcs_cn_failonnotrecommended'
    ])
    .where('egcs_cn_recommendationset', '=', String(setup.id))
    .where('_deleted', '=', false)
    .orderBy('egcs_cn_order', 'asc')
    .execute()
  if (members.length === 0 || members.some((member, index) => member.egcs_cn_order !== index + 1)) {
    throw new RecommendationMemberOrderingError()
  }

  const references: PublicationVersionReference[] = []
  const publishedMembers = await Promise.all(members.map(async member => {
    const schemaId = String(member.egcs_cn_recommendationschema)
    const schema = await resolvePublishedRecommendationSchema(db, schemaId)
    references.push({
      path: 'members.schema',
      order: member.egcs_cn_order,
      publicationId: schema.publicationId,
      kind: 'recommendation_schema',
      publicationVersionId: schema.publicationVersionId,
      publicationVersion: schema.publicationVersion
    })
    const approval = await resolvePublishedApproval(db, member.egcs_cn_approvaltemplate)
    if (approval) {
      references.push({
        path: 'members.approval',
        order: member.egcs_cn_order,
        publicationId: approval.publicationId,
        kind: 'approval_template',
        publicationVersionId: approval.publicationVersionId,
        publicationVersion: approval.publicationVersion
      })
    }
    return {
      memberId: String(member.id),
      order: member.egcs_cn_order,
      schemaId,
      schemaVersionId: schema.publicationVersionId,
      schemaVersion: schema.publicationVersion,
      schemaNameEn: schema.definition.nameEn,
      schemaNameFr: schema.definition.nameFr,
      failOnNotRecommended: member.egcs_cn_failonnotrecommended === true,
      ...(approval
        ? {
            approvalTemplateId: approval.publicationId,
            approvalVersionId: approval.publicationVersionId,
            approvalVersion: approval.publicationVersion,
            approval: approval.definition
          }
        : {})
    }
  }))
  const finalApproval = await resolvePublishedApproval(db, setup.egcs_cn_approvaltemplate)
  if (finalApproval) {
    references.push({
      path: 'finalApproval',
      order: null,
      publicationId: finalApproval.publicationId,
      kind: 'approval_template',
      publicationVersionId: finalApproval.publicationVersionId,
      publicationVersion: finalApproval.publicationVersion
    })
  }

  return {
    definition: {
      recommendationSetId: String(setup.id),
      scopeType: setup.egcs_cn_scopetype,
      scopeId: String(setup.egcs_cn_scopeid),
      nameEn: setup.egcs_cn_name_en,
      nameFr: setup.egcs_cn_name_fr,
      descriptionEn: setup.egcs_cn_description_en,
      descriptionFr: setup.egcs_cn_description_fr,
      ...(finalApproval
        ? {
            finalApproval: {
              publicationId: finalApproval.publicationId,
              publicationKind: 'approval_template' as const,
              publicationVersionId: finalApproval.publicationVersionId,
              publicationVersion: finalApproval.publicationVersion,
              definition: finalApproval.definition
            }
          }
        : {}),
      members: publishedMembers
    },
    references
  }
}

export const buildRecommendationPlan = async (
  db: DbClient,
  setup: RecommendationSetRow
): Promise<PublishedRecommendationPlan> => (await buildRecommendationPlanPublication(db, setup)).definition

export const readPublishedRecommendationPlan = (value: JsonValue): PublishedRecommendationPlan =>
  value as PublishedRecommendationPlan

export const readRecommendationSetupPublicationMetadata = async (
  db: DbClient,
  setup: RecommendationSetRow
): Promise<PublicationMetadata> => {
  try {
    const { definition } = await buildRecommendationPlanPublication(db, setup)
    return await readPublicationMetadata(db, String(setup.id), definition as JsonValue)
  } catch (error) {
    if (!(error instanceof RecommendationPublicationMissingError)
      && !(error instanceof RecommendationMemberOrderingError)) throw error
    const metadata = await readPublicationMetadata(db, String(setup.id))
    return { ...metadata, hasUnpublishedChanges: true }
  }
}

export const hasPendingRecommendationSetupChanges = async (
  db: DbClient,
  setup: RecommendationSetRow
): Promise<boolean> => (await readRecommendationSetupPublicationMetadata(db, setup)).hasUnpublishedChanges

export const resolvePublicationActorId = async (
  db: DbClient,
  authUserId: string
): Promise<string | null> => {
  const user = await db.selectFrom('Common_User').select('id')
    .where('egcs_cn_auth_user_id', '=', authUserId)
    .where('_deleted', '=', false)
    .executeTakeFirst()
  return user ? String(user.id) : null
}
