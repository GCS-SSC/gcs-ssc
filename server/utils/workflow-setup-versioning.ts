/* eslint-disable jsdoc/require-jsdoc -- typed workflow publication primitives */
import type { Kysely, Selectable, Transaction } from 'kysely'
import type { PublicationKind } from '~~/shared/constants/system-lifecycle'
import type {
  Database,
  JsonValue,
  Workflow_Purpose,
  Workflow_Setup_Member_Kind,
  Workflow_Target_Entity_Type
} from '~~/shared/types/database'
import type { StatusId } from '~~/shared/types/status'
import { readPublishedApprovalTemplate, type PublishedApprovalTemplate } from './approval-template-versioning'
import { readPublishedRecommendationPlan, type PublishedRecommendationPlan } from './recommendation-setup-versioning'
import { readPublishedReviewSetup, type PublishedReviewSetupConfiguration } from './review-setup-versioning'
import { readPublishedReviewSchema } from './review-schema-versioning'
import { ScoringMatrixItemSchema } from '~~/shared/types/schemas/assessment/assessment'
import { z } from 'zod'
import { isCoreEntityType, requiresTerminalApprovalSubmissionSuccess } from '~~/shared/constants/entity-registry'
import {
  PublishedDefinitionUnavailableError,
  readCurrentPublishedDefinition,
  readPublicationMetadata,
  type PublicationMetadata,
  type PublicationVersionReference
} from './system-publication'

type WorkflowSetupRow = Selectable<Database['Common_Workflow_Setup']>
type DbClient = Kysely<Database> | Transaction<Database>

export type PublishedWorkflowOwner = { nestedMemberId: string, defaultOwner?: string }
export type PublishedWorkflowMember = {
  memberId: string
  sequence: number
  kind: Workflow_Setup_Member_Kind
  referenceId: string
  publicationVersionId: string
  publicationVersion: number
  materializationStatus?: StatusId
  successStatus?: StatusId
  failureStatus?: StatusId
  allowOwnerRedirect: boolean
  owners: PublishedWorkflowOwner[]
  reviewPlan?: PublishedReviewSetupConfiguration
  recommendationPlan?: PublishedRecommendationPlan
  approval?: PublishedApprovalTemplate
}
export type PublishedWorkflowConfiguration = {
  nameEn: string
  nameFr: string
  descriptionEn: string
  descriptionFr: string
  entityType: Workflow_Target_Entity_Type
  purpose: Workflow_Purpose
  allowedStartStatuses: StatusId[]
  cancellationStatus: StatusId
  executionFailureStatus: StatusId
  allowRetry: boolean
  members: PublishedWorkflowMember[]
  riskRatingEffect?: PublishedRiskRatingEffect
}
export type PublishedRiskRatingBand = {
  maximumScore: number
  riskRatingId: string
  riskScore: number
  label: { en: string, fr: string }
}
export type PublishedRiskRatingEffect = {
  workflowMemberId: string
  reviewSetupMemberId: string
  assessmentSchemaPublicationId: string
  assessmentSchemaVersionId: string
  assessmentSchemaVersion: number
  bands: PublishedRiskRatingBand[]
}
export type WorkflowPublicationStatusReference = {
  statusId: StatusId
  role: Database['Common_Workflow_Publication_Status']['egcs_cn_role']
  order: number
}
export type WorkflowSetupPublicationPlan = {
  definition: PublishedWorkflowConfiguration
  references: PublicationVersionReference[]
  statuses: WorkflowPublicationStatusReference[]
}

export type RuntimeWorkflowSetup = WorkflowSetupRow & { egcs_cn_allowedstartstatuses: StatusId[] }
export type WorkflowStatusGraphDefinition = { id: StatusId, terminal: boolean }

const causedByUnavailablePublishedDefinition = (error: unknown): boolean => {
  let current = error
  while (current instanceof Error) {
    if (current instanceof PublishedDefinitionUnavailableError) return true
    current = current.cause
  }
  return false
}

export const lockWorkflowSetupForMutation = async (db: DbClient, setupId: string, streamId: string) =>
  await db.selectFrom('Common_Workflow_Setup')
    .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Workflow_Setup.id')
    .selectAll('Common_Workflow_Setup')
    .select('Common_Publication.egcs_cn_state as publicationState')
    .where('Common_Workflow_Setup.id', '=', setupId)
    .where('Common_Workflow_Setup.egcs_cn_scopetype', '=', 'transferpaymentstream')
    .where('Common_Workflow_Setup.egcs_cn_scopeid', '=', streamId)
    .where('Common_Workflow_Setup._deleted', '=', false)
    .where('Common_Publication._deleted', '=', false)
    .forUpdate(['Common_Workflow_Setup', 'Common_Publication'])
    .executeTakeFirst()

const resolvePublishedMember = async <T>(
  db: DbClient,
  publicationId: string,
  kind: PublicationKind,
  errorMessage: string,
  reader: (value: JsonValue) => T
) => {
  let published: Awaited<ReturnType<typeof readCurrentPublishedDefinition>>
  try {
    published = await readCurrentPublishedDefinition(db, publicationId, kind)
  } catch (error) {
    if (!(error instanceof PublishedDefinitionUnavailableError)) throw error
    throw new Error(errorMessage, { cause: error })
  }
  const unavailableNested = await db.selectFrom('Common_Publication_Version_Reference')
    .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Publication_Version_Reference.egcs_cn_publication')
    .select(['Common_Publication.id', 'Common_Publication.egcs_cn_kind'])
    .where('Common_Publication_Version_Reference.egcs_cn_parentversion', '=', published.publicationVersionId)
    .where('Common_Publication.egcs_cn_state', '<>', 'published')
    .where('Common_Publication._deleted', '=', false)
    .executeTakeFirst()
  if (unavailableNested) {
    const cause = new PublishedDefinitionUnavailableError(
      String(unavailableNested.id), unavailableNested.egcs_cn_kind
    )
    throw new Error(errorMessage, { cause })
  }
  return { ...published, definition: reader(published.definition) }
}

export const buildPublishedWorkflowConfiguration = async (
  db: DbClient,
  setup: WorkflowSetupRow
): Promise<PublishedWorkflowConfiguration> => (await buildWorkflowSetupPublication(db, setup)).definition

export const buildWorkflowSetupPublication = async (
  db: DbClient,
  setup: WorkflowSetupRow
): Promise<WorkflowSetupPublicationPlan> => {
  const [rows, allowedRows] = await Promise.all([
    db.selectFrom('Common_Workflow_Setup_Member').selectAll()
      .where('egcs_cn_workflowsetup', '=', String(setup.id)).where('_deleted', '=', false)
      .orderBy('egcs_cn_sequence', 'asc').execute(),
    db.selectFrom('Common_Workflow_Setup_Allowed_Start_Status').select('egcs_cn_status')
      .where('egcs_cn_workflowsetup', '=', String(setup.id)).where('_deleted', '=', false)
      .orderBy('egcs_cn_order', 'asc').execute()
  ])
  if (rows.length === 0 || rows.some((member, index) => member.egcs_cn_sequence !== index + 1)) {
    throw new Error('Workflow requires at least one contiguously ordered member')
  }

  const references: PublicationVersionReference[] = []
  const members: PublishedWorkflowMember[] = []
  for (const row of rows) {
    const ownerRows = await db.selectFrom('Common_Workflow_Setup_Member_Owner').selectAll()
      .where('egcs_cn_workflowsetupmember', '=', String(row.id)).where('_deleted', '=', false).orderBy('id', 'asc').execute()
    const referenceId = String(row.egcs_cn_reviewset ?? row.egcs_cn_recommendationset ?? row.egcs_cn_approvaltemplate)
    let kind: PublicationKind
    let publicationId: string
    let publicationVersionId: string
    let publicationVersion: number
    let nestedDefinition: Pick<PublishedWorkflowMember, 'reviewPlan' | 'recommendationPlan' | 'approval'> = {}
    if (row.egcs_cn_reviewset) {
      kind = 'review_set_setup'
      const published = await resolvePublishedMember(
        db, referenceId, kind, 'Workflow review setup must be published first', readPublishedReviewSetup
      )
      publicationVersionId = published.publicationVersionId
      publicationVersion = published.publicationVersion
      publicationId = published.publicationId
      nestedDefinition = { reviewPlan: published.definition }
      if (published.definition.entityType !== setup.egcs_cn_entitytype) {
        throw new Error('Workflow review setup entity type must match its workflow target')
      }
    } else if (row.egcs_cn_recommendationset) {
      kind = 'recommendation_set_setup'
      const published = await resolvePublishedMember(
        db, referenceId, kind, 'Workflow recommendation setup must be published first', readPublishedRecommendationPlan
      )
      publicationVersionId = published.publicationVersionId
      publicationVersion = published.publicationVersion
      publicationId = published.publicationId
      nestedDefinition = { recommendationPlan: published.definition }
    } else {
      kind = 'approval_template'
      const published = await resolvePublishedMember(
        db, referenceId, kind, 'Workflow approval template must be published first', readPublishedApprovalTemplate
      )
      publicationVersionId = published.publicationVersionId
      publicationVersion = published.publicationVersion
      publicationId = published.publicationId
      nestedDefinition = { approval: published.definition }
    }
    references.push({
      path: `members.${row.egcs_cn_kind}`,
      order: row.egcs_cn_sequence,
      publicationId,
      kind,
      publicationVersionId,
      publicationVersion
    })
    members.push({
      memberId: String(row.id), sequence: row.egcs_cn_sequence, kind: row.egcs_cn_kind,
      referenceId, publicationVersionId,
      publicationVersion,
      ...(row.egcs_cn_materializationstatus ? { materializationStatus: String(row.egcs_cn_materializationstatus) } : {}),
      ...(row.egcs_cn_successstatus ? { successStatus: String(row.egcs_cn_successstatus) } : {}),
      ...(row.egcs_cn_failurestatus ? { failureStatus: String(row.egcs_cn_failurestatus) } : {}),
      allowOwnerRedirect: row.egcs_cn_allowownerredirect,
      owners: ownerRows.map(owner => ({
        nestedMemberId: String(owner.egcs_cn_reviewsetup ?? owner.egcs_cn_recommendationsetup),
        ...(owner.egcs_cn_defaultowner ? { defaultOwner: String(owner.egcs_cn_defaultowner) } : {})
      })),
      ...nestedDefinition
    })
  }
  const definition: PublishedWorkflowConfiguration = {
    nameEn: setup.egcs_cn_name_en, nameFr: setup.egcs_cn_name_fr,
    descriptionEn: setup.egcs_cn_description_en, descriptionFr: setup.egcs_cn_description_fr,
    entityType: setup.egcs_cn_entitytype as Workflow_Target_Entity_Type,
    purpose: setup.egcs_cn_purpose,
    allowedStartStatuses: allowedRows.map(row => String(row.egcs_cn_status)),
    cancellationStatus: String(setup.egcs_cn_cancellationstatus),
    executionFailureStatus: String(setup.egcs_cn_executionfailurestatus),
    allowRetry: setup.egcs_cn_allowretry,
    members
  }
  if (definition.purpose === 'risk_rating') {
    definition.riskRatingEffect = await buildRiskRatingEffect(db, setup, members)
  }
  if (definition.purpose === 'approval_submission') {
    const hasApproval = members.some(member => member.kind === 'approval_template'
      || Boolean(member.recommendationPlan?.finalApproval)
      || member.recommendationPlan?.members.some(candidate => Boolean(candidate.approval)))
    if (!hasApproval) throw new Error('Approval submission workflow requires an approval stage')
  }
  validatePublishedWorkflowStatusGraph(definition, await readLockedWorkflowStatusDefinitions(db, setup, definition))
  return {
    definition,
    references,
    statuses: [
      ...definition.allowedStartStatuses.map((statusId, index) => ({ statusId, role: 'allowed_start' as const, order: index + 1 })),
      { statusId: definition.cancellationStatus, role: 'cancellation', order: 1 },
      { statusId: definition.executionFailureStatus, role: 'execution_failure', order: 1 },
      ...members.flatMap(member => [
        ...(member.materializationStatus ? [{ statusId: member.materializationStatus, role: 'materialization' as const, order: member.sequence }] : []),
        ...(member.successStatus ? [{ statusId: member.successStatus, role: 'success' as const, order: member.sequence }] : []),
        ...(member.failureStatus ? [{ statusId: member.failureStatus, role: 'failure' as const, order: member.sequence }] : [])
      ])
    ]
  }
}

const buildRiskRatingEffect = async (
  db: DbClient,
  setup: WorkflowSetupRow,
  members: PublishedWorkflowMember[]
): Promise<PublishedRiskRatingEffect> => {
  if (setup.egcs_cn_entitytype !== 'fundingcaseagreement' || setup.egcs_cn_scopetype !== 'transferpaymentstream') {
    throw new Error('Risk Rating workflow must target an Agreement in a Stream')
  }
  const sources = members.flatMap(workflowMember => (workflowMember.reviewPlan?.members ?? [])
    .filter(reviewMember => reviewMember.reviewType === 'assessment')
    .map(reviewMember => ({ workflowMember, reviewMember })))
  if (sources.length !== 1) throw new Error('Risk Rating workflow requires exactly one assessment review')
  const source = sources[0]!
  const version = await db.selectFrom('Common_Publication_Version')
    .select('egcs_cn_definition')
    .where('id', '=', source.reviewMember.schema.publicationVersionId)
    .executeTakeFirst()
  const schema = version ? readPublishedReviewSchema(version.egcs_cn_definition) : null
  if (!schema || schema.reviewType !== 'assessment') throw new Error('Risk Rating assessment schema version is unavailable')
  const parsedBands = z.array(ScoringMatrixItemSchema).safeParse(schema.scoringMatrix)
  if (!parsedBands.success || parsedBands.data.length === 0) throw new Error('Risk Rating assessment bands must not be empty')
  const maxima = parsedBands.data.map(band => Number(band.max))
  if (maxima.some((maximum, index) => !Number.isFinite(maximum) || (index > 0 && maximum <= maxima[index - 1]!))) {
    throw new Error('Risk Rating assessment bands must have strictly increasing maxima')
  }
  const ratings = await db.selectFrom('Transfer_Payment_Stream_Risk_Rating')
    .select(['id', 'egcs_tp_riskscore', 'egcs_tp_name_en', 'egcs_tp_name_fr'])
    .where('egcs_tp_transferpaymentstream', '=', String(setup.egcs_cn_scopeid))
    .where('_deleted', '=', false)
    .orderBy('egcs_tp_riskscore', 'asc')
    .forUpdate()
    .execute()
  if (ratings.length !== maxima.length || ratings.some((rating, index) => Number(rating.egcs_tp_riskscore) !== maxima[index])) {
    throw new Error('Risk Rating assessment maxima must match active Stream risk-rating scores')
  }
  return {
    workflowMemberId: source.workflowMember.memberId,
    reviewSetupMemberId: source.reviewMember.memberId,
    assessmentSchemaPublicationId: source.reviewMember.schema.publicationId,
    assessmentSchemaVersionId: source.reviewMember.schema.publicationVersionId,
    assessmentSchemaVersion: source.reviewMember.schema.publicationVersion,
    bands: ratings.map((rating, index) => ({
      maximumScore: maxima[index]!,
      riskRatingId: String(rating.id),
      riskScore: Number(rating.egcs_tp_riskscore),
      label: { en: rating.egcs_tp_name_en, fr: rating.egcs_tp_name_fr }
    }))
  }
}

export const readPublishedWorkflowConfiguration = (value: JsonValue): PublishedWorkflowConfiguration =>
  value as PublishedWorkflowConfiguration

export const applyPublishedWorkflowConfiguration = (
  setup: WorkflowSetupRow,
  configuration: PublishedWorkflowConfiguration
): RuntimeWorkflowSetup => ({
  ...setup,
  egcs_cn_name_en: configuration.nameEn, egcs_cn_name_fr: configuration.nameFr,
  egcs_cn_description_en: configuration.descriptionEn, egcs_cn_description_fr: configuration.descriptionFr,
  egcs_cn_entitytype: configuration.entityType,
  egcs_cn_purpose: configuration.purpose ?? 'standard',
  egcs_cn_allowedstartstatuses: configuration.allowedStartStatuses,
  egcs_cn_cancellationstatus: configuration.cancellationStatus,
  egcs_cn_executionfailurestatus: configuration.executionFailureStatus,
  egcs_cn_allowretry: configuration.allowRetry
})

export const validatePublishedWorkflowStatusGraph = (
  configuration: PublishedWorkflowConfiguration,
  definitions: ReadonlyMap<StatusId, WorkflowStatusGraphDefinition>
): void => {
  const requireDefinition = (statusId: StatusId): WorkflowStatusGraphDefinition => {
    const definition = definitions.get(statusId)
    if (!definition) throw new Error('Workflow references an unavailable Agency status')
    return definition
  }
  if (configuration.allowedStartStatuses.length === 0) throw new Error('Workflow requires at least one allowed-start status')
  if (configuration.allowedStartStatuses.some(statusId => requireDefinition(statusId).terminal)) {
    throw new Error('Terminal statuses cannot start a workflow')
  }
  requireDefinition(configuration.cancellationStatus)
  requireDefinition(configuration.executionFailureStatus)
  const lastIndex = configuration.members.length - 1
  configuration.members.forEach((member, index) => {
    if (member.materializationStatus && requireDefinition(member.materializationStatus).terminal) {
      throw new Error('Terminal statuses cannot be workflow materialization statuses')
    }
    if (member.successStatus && requireDefinition(member.successStatus).terminal && index !== lastIndex) {
      throw new Error('A terminal workflow output must immediately end the run')
    }
    if (member.failureStatus) requireDefinition(member.failureStatus)
  })
  if (configuration.purpose === 'approval_submission'
    && isCoreEntityType(configuration.entityType)
    && requiresTerminalApprovalSubmissionSuccess(configuration.entityType)) {
    const successStatus = configuration.members.at(-1)?.successStatus
    if (!successStatus || !requireDefinition(successStatus).terminal) {
      throw new Error('Workflow approval-submission success must produce a terminal status for this entity type')
    }
  }
}

const readLockedWorkflowStatusDefinitions = async (
  db: DbClient,
  setup: WorkflowSetupRow,
  configuration: PublishedWorkflowConfiguration
): Promise<Map<StatusId, WorkflowStatusGraphDefinition>> => {
  if (setup.egcs_cn_scopetype !== 'transferpaymentstream') throw new Error('Agency status workflows require a Stream scope')
  const stream = await db.selectFrom('Transfer_Payment_Stream')
    .innerJoin('Transfer_Payment_Profile', 'Transfer_Payment_Profile.id', 'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile')
    .select('Transfer_Payment_Profile.egcs_tp_agency as agencyId')
    .where('Transfer_Payment_Stream.id', '=', String(setup.egcs_cn_scopeid))
    .where('Transfer_Payment_Stream._deleted', '=', false).where('Transfer_Payment_Profile._deleted', '=', false)
    .executeTakeFirst()
  if (!stream) throw new Error('Workflow Stream Agency is unavailable')
  const statusIds = [...new Set([
    ...configuration.allowedStartStatuses,
    configuration.cancellationStatus,
    configuration.executionFailureStatus,
    ...configuration.members.flatMap(member => [member.materializationStatus, member.successStatus, member.failureStatus])
  ].filter((value): value is StatusId => Boolean(value)))]
  const statuses = await db.selectFrom('Common_Status').select(['id', 'egcs_cn_terminal'])
    .where('id', 'in', statusIds).where('egcs_cn_agency', '=', String(stream.agencyId))
    .where('_deleted', '=', false).forUpdate().execute()
  return new Map(statuses.map(status => [String(status.id), { id: String(status.id), terminal: status.egcs_cn_terminal }]))
}

export const readWorkflowSetupPublicationMetadata = async (
  db: DbClient,
  setup: WorkflowSetupRow
): Promise<PublicationMetadata> => {
  try {
    const { definition } = await buildWorkflowSetupPublication(db, setup)
    return await readPublicationMetadata(db, String(setup.id), definition as unknown as JsonValue)
  } catch (error) {
    if (!causedByUnavailablePublishedDefinition(error)) throw error
    const metadata = await readPublicationMetadata(db, String(setup.id))
    return { ...metadata, hasUnpublishedChanges: metadata.publicationState !== 'retired' }
  }
}

export const hasPendingWorkflowSetupChanges = async (db: DbClient, setup: WorkflowSetupRow): Promise<boolean> =>
  (await readWorkflowSetupPublicationMetadata(db, setup)).hasUnpublishedChanges

export const resolveWorkflowPublicationActorId = async (db: DbClient, authUserId: string): Promise<string | null> => {
  const user = await db.selectFrom('Common_User').select('id')
    .where('egcs_cn_auth_user_id', '=', authUserId).where('_deleted', '=', false).executeTakeFirst()
  return user ? String(user.id) : null
}
