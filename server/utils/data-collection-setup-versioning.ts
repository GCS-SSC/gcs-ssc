/* eslint-disable jsdoc/require-jsdoc -- Typed Data Collection publication adapter. */
import type { Kysely, Selectable, Transaction } from 'kysely'
import { z } from 'zod'
import type { Database, JsonValue } from '~~/shared/types/database'
import { DataCollectionDefinitionSchema } from '~~/shared/types/schemas/data-collection'
import { PositivePostgresBigintIdSchema } from '~~/shared/types/schemas/common'
import { readPublishedApprovalTemplate } from './approval-template-versioning'
import {
  readCurrentPublishedDefinition,
  readPublicationMetadata,
  PublishedDefinitionUnavailableError,
  type PublicationVersionReference
} from './system-publication'

type DbClient = Kysely<Database> | Transaction<Database>
type SetupRow = Selectable<Database['Common_Data_Collection_Setup']>

export class DataCollectionPublicationMissingError extends Error {
  constructor(templateId: string) {
    super(`Approval template ${templateId} must be published first`)
    this.name = 'DataCollectionPublicationMissingError'
  }
}

// Match the evidence emitted by buildApprovalTemplateConfiguration. Data Collection
// validates embedded approval evidence without changing Recommendation's reader.
const PublishedApprovalEvidenceSchema = z.strictObject({
  templateId: PositivePostgresBigintIdSchema,
  nameEn: z.string(),
  nameFr: z.string(),
  descriptionEn: z.string(),
  descriptionFr: z.string(),
  allowAdditionalApprovals: z.boolean(),
  defaultAddedApprovalNameEn: z.string().optional(),
  defaultAddedApprovalNameFr: z.string().optional(),
  allowAddedApprovalNameChanges: z.boolean(),
  allowAddedApprovalCertificationChanges: z.boolean(),
  additionalCertifications: z.array(z.strictObject({
    order: z.number().int().nonnegative(),
    descriptionEn: z.string(),
    descriptionFr: z.string(),
    nameEn: z.string(),
    nameFr: z.string(),
    optional: z.boolean(),
    certificationEn: z.string(),
    certificationFr: z.string()
  })),
  steps: z.array(z.strictObject({
    stepId: PositivePostgresBigintIdSchema,
    sequence: z.number().int().positive(),
    nameEn: z.string(),
    nameFr: z.string(),
    defaultUser: PositivePostgresBigintIdSchema.optional(),
    defaultGroup: PositivePostgresBigintIdSchema.optional(),
    requireGroupDetails: z.boolean().optional(),
    certifications: z.array(z.strictObject({
      optional: z.boolean(),
      certificationEn: z.string(),
      certificationFr: z.string()
    }))
  })).min(1)
})

const PublishedDataCollectionSetupSchema = z.object({
  dataCollectionId: PositivePostgresBigintIdSchema,
  agencyId: PositivePostgresBigintIdSchema,
  nameEn: z.string(),
  nameFr: z.string(),
  descriptionEn: z.string(),
  descriptionFr: z.string(),
  definition: DataCollectionDefinitionSchema,
  approval: z.object({
    publicationId: PositivePostgresBigintIdSchema,
    publicationKind: z.literal('approval_template'),
    publicationVersionId: PositivePostgresBigintIdSchema,
    publicationVersion: z.number().int().positive(),
    definition: PublishedApprovalEvidenceSchema
  }).strict().refine(approval => approval.definition.templateId === approval.publicationId).optional()
}).strict()

export type PublishedDataCollectionSetup = z.infer<typeof PublishedDataCollectionSetupSchema>

export const readPublishedDataCollectionSetup = (value: JsonValue): PublishedDataCollectionSetup =>
  PublishedDataCollectionSetupSchema.parse(value)

export const lockDataCollectionSetupForMutation = async (db: DbClient, setupId: string, agencyId: string) =>
  await db.selectFrom('Common_Data_Collection_Setup')
    .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Data_Collection_Setup.id')
    .selectAll('Common_Data_Collection_Setup')
    .select('Common_Publication.egcs_cn_state as publicationState')
    .where('Common_Data_Collection_Setup.id', '=', setupId)
    .where('Common_Data_Collection_Setup.egcs_cn_agency', '=', agencyId)
    .where('Common_Data_Collection_Setup._deleted', '=', false)
    .where('Common_Publication._deleted', '=', false)
    .forUpdate(['Common_Data_Collection_Setup', 'Common_Publication'])
    .executeTakeFirst()

export const buildDataCollectionSetupPublication = async (db: DbClient, setup: SetupRow): Promise<{
  definition: PublishedDataCollectionSetup
  references: PublicationVersionReference[]
}> => {
  const definition = {
    dataCollectionId: String(setup.id),
    agencyId: String(setup.egcs_cn_agency),
    nameEn: setup.egcs_cn_name_en,
    nameFr: setup.egcs_cn_name_fr,
    descriptionEn: setup.egcs_cn_description_en,
    descriptionFr: setup.egcs_cn_description_fr,
    definition: DataCollectionDefinitionSchema.parse(setup.egcs_cn_schema)
  }
  if (!setup.egcs_cn_approvaltemplate) return { definition, references: [] }
  const approvalId = String(setup.egcs_cn_approvaltemplate)
  try {
    const published = await readCurrentPublishedDefinition(db, approvalId, 'approval_template')
    const approval = {
      publicationId: published.publicationId,
      publicationKind: 'approval_template' as const,
      publicationVersionId: published.publicationVersionId,
      publicationVersion: published.publicationVersion,
      definition: PublishedApprovalEvidenceSchema.parse(readPublishedApprovalTemplate(published.definition))
    }
    return {
      definition: { ...definition, approval },
      references: [{
        path: 'approval', order: null, publicationId: approval.publicationId, kind: 'approval_template',
        publicationVersionId: approval.publicationVersionId, publicationVersion: approval.publicationVersion
      }]
    }
  } catch (error) {
    if (!(error instanceof PublishedDefinitionUnavailableError)) throw error
    throw new DataCollectionPublicationMissingError(approvalId)
  }
}

export const readDataCollectionSetupPublicationMetadata = async (db: DbClient, setup: SetupRow) => {
  try {
    const publication = await buildDataCollectionSetupPublication(db, setup)
    return await readPublicationMetadata(db, String(setup.id), publication.definition as JsonValue)
  } catch (error) {
    if (!(error instanceof DataCollectionPublicationMissingError)) throw error
    return { ...await readPublicationMetadata(db, String(setup.id)), hasUnpublishedChanges: true }
  }
}
