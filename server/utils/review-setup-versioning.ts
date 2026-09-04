/* eslint-disable jsdoc/require-jsdoc -- typed publication adapter */
import type { Kysely, Selectable, Transaction } from 'kysely'
import type { PublicationKind } from '~~/shared/constants/system-lifecycle'
import type { Database, Entity_Type, JsonValue, Review_Type } from '~~/shared/types/database'
import type { PublicationMetadata, PublicationVersionReference } from './system-publication'
import { readPublicationMetadata } from './system-publication'
import { readPublishedReviewSchema } from './review-schema-versioning'

type ReviewSetupRow = Selectable<Database['Common_Review_Set_Setup']>
type DbClient = Kysely<Database> | Transaction<Database>

export type PublishedPublicationReference = {
  publicationId: string
  publicationKind: PublicationKind
  publicationVersionId: string
  publicationVersion: number
}

export type PublishedReviewSetupMember = {
  memberId: string
  order: number
  reviewType: Review_Type
  schema: PublishedPublicationReference
  failOnChecklistFailure: boolean
  failureThreshold: number | null
  approval?: PublishedPublicationReference
}

export type PublishedReviewSetupConfiguration = {
  kind: 'review_set_setup'
  reviewSetupId: string
  entityType: Entity_Type
  scopeType: ReviewSetupRow['egcs_cn_scopetype']
  scopeId: string
  name: { en: string, fr: string }
  description: { en: string, fr: string }
  order: number
  sequential: boolean
  finalApproval?: PublishedPublicationReference
  members: PublishedReviewSetupMember[]
}

export type ReviewSetupPublicationPlan = {
  definition: PublishedReviewSetupConfiguration
  references: PublicationVersionReference[]
}

const resolvePublishedReference = async (
  db: DbClient,
  publicationId: string,
  kind: PublicationKind
): Promise<PublishedPublicationReference & { definition: JsonValue }> => {
  const publication = await db.selectFrom('Common_Publication')
    .innerJoin('Common_Publication_Version', 'Common_Publication_Version.id', 'Common_Publication.egcs_cn_currentversion')
    .select([
      'Common_Publication.id',
      'Common_Publication.egcs_cn_kind',
      'Common_Publication.egcs_cn_state',
      'Common_Publication_Version.id as versionId',
      'Common_Publication_Version.egcs_cn_version',
      'Common_Publication_Version.egcs_cn_definition'
    ])
    .where('Common_Publication.id', '=', publicationId)
    .where('Common_Publication.egcs_cn_kind', '=', kind)
    .where('Common_Publication.egcs_cn_state', '=', 'published')
    .where('Common_Publication._deleted', '=', false)
    .executeTakeFirst()
  if (!publication) {
    const resource = kind === 'review_schema' ? 'Review schema' : 'Approval template'
    throw new Error(`${resource} ${publicationId} must be published first`)
  }
  return {
    publicationId: String(publication.id),
    publicationKind: publication.egcs_cn_kind,
    publicationVersionId: String(publication.versionId),
    publicationVersion: Number(publication.egcs_cn_version),
    definition: publication.egcs_cn_definition
  }
}

const toVersionReference = (
  reference: PublishedPublicationReference,
  path: string,
  order: number | null
): PublicationVersionReference => ({
  path,
  order,
  publicationId: reference.publicationId,
  kind: reference.publicationKind,
  publicationVersionId: reference.publicationVersionId,
  publicationVersion: reference.publicationVersion
})

export const buildReviewSetupPublication = async (
  db: DbClient,
  setup: ReviewSetupRow
): Promise<ReviewSetupPublicationPlan> => {
  const members = await db.selectFrom('Common_Review_Setup')
    .innerJoin('Common_Review_Schema', 'Common_Review_Schema.id', 'Common_Review_Setup.egcs_cn_reviewschema')
    .select([
      'Common_Review_Setup.id',
      'Common_Review_Setup.egcs_cn_order',
      'Common_Review_Setup.egcs_cn_reviewschema',
      'Common_Review_Setup.egcs_cn_approvaltemplate',
      'Common_Review_Setup.egcs_cn_failonchecklistfailure',
      'Common_Review_Setup.egcs_cn_failurethreshold',
      'Common_Review_Schema.egcs_cn_reviewtype'
    ])
    .where('Common_Review_Setup.egcs_cn_reviewset', '=', String(setup.id))
    .where('Common_Review_Setup._deleted', '=', false)
    .where('Common_Review_Schema._deleted', '=', false)
    .orderBy('Common_Review_Setup.egcs_cn_order', 'asc')
    .execute()
  if (members.length === 0 || members.some((member, index) => member.egcs_cn_order !== index + 1)) {
    throw new Error('Review setup members must use contiguous ordering beginning at 1')
  }

  const references: PublicationVersionReference[] = []
  const publishedMembers = await Promise.all(members.map(async member => {
    const schema = await resolvePublishedReference(db, String(member.egcs_cn_reviewschema), 'review_schema')
    const schemaDefinition = readPublishedReviewSchema(schema.definition)
    if (!schemaDefinition || schemaDefinition.entityType !== setup.egcs_cn_entitytype) {
      throw new Error('Review schema entity type must match its review setup')
    }
    references.push(toVersionReference(schema, 'members.schema', member.egcs_cn_order))
    const approval = member.egcs_cn_approvaltemplate
      ? await resolvePublishedReference(db, String(member.egcs_cn_approvaltemplate), 'approval_template')
      : undefined
    if (approval) references.push(toVersionReference(approval, 'members.approval', member.egcs_cn_order))
    return {
      memberId: String(member.id),
      order: member.egcs_cn_order,
      reviewType: member.egcs_cn_reviewtype,
      schema,
      failOnChecklistFailure: member.egcs_cn_failonchecklistfailure === true,
      failureThreshold: member.egcs_cn_failurethreshold === null ? null : Number(member.egcs_cn_failurethreshold),
      ...(approval ? { approval } : {})
    }
  }))
  const finalApproval = setup.egcs_cn_approvaltemplate
    ? await resolvePublishedReference(db, String(setup.egcs_cn_approvaltemplate), 'approval_template')
    : undefined
  if (finalApproval) references.push(toVersionReference(finalApproval, 'finalApproval', null))

  return {
    definition: {
      kind: 'review_set_setup',
      reviewSetupId: String(setup.id),
      entityType: setup.egcs_cn_entitytype,
      scopeType: setup.egcs_cn_scopetype,
      scopeId: String(setup.egcs_cn_scopeid),
      name: { en: setup.egcs_cn_name_en, fr: setup.egcs_cn_name_fr },
      description: { en: setup.egcs_cn_description_en, fr: setup.egcs_cn_description_fr },
      order: setup.egcs_cn_order,
      sequential: setup.egcs_cn_sequential,
      ...(finalApproval ? { finalApproval } : {}),
      members: publishedMembers
    },
    references
  }
}

export const buildReviewSetupConfiguration = async (db: DbClient, setup: ReviewSetupRow) => (
  await buildReviewSetupPublication(db, setup)
).definition

export const readPublishedReviewSetup = (value: JsonValue): PublishedReviewSetupConfiguration =>
  value as PublishedReviewSetupConfiguration

export const readReviewSetupPublicationMetadata = async (
  db: DbClient,
  setup: ReviewSetupRow
): Promise<PublicationMetadata> => {
  try {
    const { definition } = await buildReviewSetupPublication(db, setup)
    return await readPublicationMetadata(db, String(setup.id), definition as unknown as JsonValue)
  } catch {
    const metadata = await readPublicationMetadata(db, String(setup.id))
    return { ...metadata, hasUnpublishedChanges: metadata.publicationState !== 'retired' }
  }
}

export const hasPendingReviewSetupChanges = async (db: DbClient, setup: ReviewSetupRow): Promise<boolean> => (
  await readReviewSetupPublicationMetadata(db, setup)
).hasUnpublishedChanges
