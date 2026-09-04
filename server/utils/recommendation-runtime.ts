/* eslint-disable jsdoc/require-jsdoc -- typed recommendation runtime helpers */
import type { H3Event } from 'h3'
import type { Kysely, Selectable, Transaction } from 'kysely'
import { RUNTIME_TERMINAL_STATES } from '~~/shared/constants/system-lifecycle'
import type {
  CommonScopeEntityType,
  Database,
  Entity_Type,
  JsonValue,
  Workflow_Purpose
} from '~~/shared/types/database'
import {
  deriveRecommendationOutcome,
  RecommendationDefinitionSchema,
  validateRecommendationResponses
} from '~~/shared/types/schemas/recommendation/recommendation'
import type { RecommendationResponse } from '~~/shared/types/schemas/recommendation/recommendation'
import { badRequest, forbidden, notFound, throwApiError } from './api-errors'
import { materializeCanonicalApprovalRuntime } from './canonical-approval-runtime'
import { createPrimaryEntityAssignment } from './entity-assignment'
import {
  readPublishedRecommendationPlan,
  readPublishedRecommendationSchema,
  type PublishedRecommendationPlan,
  type PublishedRecommendationSchema
} from './recommendation-setup-versioning'
import {
  createRuntimeItem,
  reduceRuntimeState,
  transitionRuntimeItem
} from './system-runtime'
import type { ReviewRuntimeEntityContext } from './review-runtime-access'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

type DbClient = Kysely<Database> | Transaction<Database>
export type RecommendationRuntimeSetupScope = { scopeType: CommonScopeEntityType, scopeId: string }

type LockedRecommendationMember = PublishedRecommendationPlan['members'][number] & {
  schemaDefinition: PublishedRecommendationSchema
  schemaAgencyId: string
  defaultOwnerId?: string
}

type LockedRecommendationSetup = {
  recommendationSetSetup: Selectable<Database['Common_Recommendation_Set_Setup']>
  publication: PublishedRecommendationPlan
  publicationVersionId: string
  publicationVersion: number
  members: LockedRecommendationMember[]
}

type CreateRuntimeRecommendationSetTransactionInput = {
  db: Transaction<Database>
  recommendationSetSetupId: string
  entityType: Entity_Type
  entityId: string
  creatorCommonUserId: string
  ownerByMemberId?: Map<string, string>
  ownerAgencyId: string
  setupScopes: RecommendationRuntimeSetupScope[]
  publication?: PublishedRecommendationPlan
  publicationVersionId?: string
  publicationVersion?: number
  runtimeId: string
  runtimeItemOrder?: number
}

export const readRuntimeRecommendationConfiguration = (value: JsonValue): PublishedRecommendationPlan =>
  readPublishedRecommendationPlan(value)

const readPinnedRecommendationSchema = async (
  db: DbClient,
  member: PublishedRecommendationPlan['members'][number],
  requirePublished: boolean
): Promise<LockedRecommendationMember | null> => {
  let query = db.selectFrom('Common_Publication_Version')
    .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Publication_Version.egcs_cn_publication')
    .innerJoin('Common_Recommendation_Schema', 'Common_Recommendation_Schema.id', 'Common_Publication.id')
    .select([
      'Common_Publication_Version.id as versionId',
      'Common_Publication_Version.egcs_cn_version as version',
      'Common_Publication_Version.egcs_cn_definition as definition',
      'Common_Recommendation_Schema.egcs_cn_agency as agencyId'
    ])
    .where('Common_Publication.id', '=', member.schemaId)
    .where('Common_Publication.egcs_cn_kind', '=', 'recommendation_schema')
    .where('Common_Publication_Version.id', '=', member.schemaVersionId)
    .where('Common_Publication_Version.egcs_cn_version', '=', member.schemaVersion)
    .where('Common_Publication._deleted', '=', false)
    .where('Common_Recommendation_Schema._deleted', '=', false)
  if (requirePublished) query = query.where('Common_Publication.egcs_cn_state', '=', 'published')
  const row = await query.executeTakeFirst()
  if (!row) return null
  const definition = readPublishedRecommendationSchema(row.definition)
  if (definition.schemaId !== member.schemaId) return null
  return {
    ...member,
    schemaVersionId: String(row.versionId),
    schemaVersion: Number(row.version),
    schemaDefinition: definition,
    schemaAgencyId: String(row.agencyId)
  }
}

const validatePinnedApprovals = async (
  db: DbClient,
  publication: PublishedRecommendationPlan,
  members: LockedRecommendationMember[],
  requirePublished: boolean
): Promise<boolean> => {
  const approvalReferences = [
    ...(publication.finalApproval
      ? [{
          publicationId: publication.finalApproval.publicationId,
          versionId: publication.finalApproval.publicationVersionId,
          version: publication.finalApproval.publicationVersion
        }]
      : []),
    ...members.flatMap(member => member.approvalTemplateId && member.approvalVersionId
      ? [{ publicationId: member.approvalTemplateId, versionId: member.approvalVersionId, version: member.approvalVersion }]
      : [])
  ]
  for (const reference of approvalReferences) {
    let query = db.selectFrom('Common_Publication_Version')
      .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Publication_Version.egcs_cn_publication')
      .select('Common_Publication_Version.id')
      .where('Common_Publication.id', '=', reference.publicationId)
      .where('Common_Publication.egcs_cn_kind', '=', 'approval_template')
      .where('Common_Publication._deleted', '=', false)
      .where('Common_Publication_Version.id', '=', reference.versionId)
    if (requirePublished) query = query.where('Common_Publication.egcs_cn_state', '=', 'published')
    if (reference.version !== undefined) {
      query = query.where('Common_Publication_Version.egcs_cn_version', '=', reference.version)
    }
    if (!await query.executeTakeFirst()) return false
  }
  return true
}

export const lockEligibleRuntimeRecommendationSetSetupSnapshot = async (
  db: Transaction<Database>,
  recommendationSetSetupId: string,
  entityType: Entity_Type,
  ownerAgencyId: string,
  setupScopes: RecommendationRuntimeSetupScope[],
  pinnedPublication?: PublishedRecommendationPlan,
  pinnedPublicationVersionId?: string,
  pinnedPublicationVersion?: number,
  allowHistoricalVersions = false
): Promise<LockedRecommendationSetup | null> => {
  const selectionKeys = setupScopes.map(scope => `${scope.scopeType}:${scope.scopeId}`)
  const setup = pinnedPublication
    ? await db.selectFrom('Common_Recommendation_Set_Setup')
        .selectAll('Common_Recommendation_Set_Setup')
        .where('Common_Recommendation_Set_Setup.id', '=', recommendationSetSetupId)
        .where('Common_Recommendation_Set_Setup._deleted', '=', false)
        .forUpdate()
        .executeTakeFirst()
    : await db.selectFrom('Common_Recommendation_Set_Setup')
        .innerJoin(
          'Common_Publication_Selection',
          'Common_Publication_Selection.egcs_cn_publication',
          'Common_Recommendation_Set_Setup.id'
        )
        .selectAll('Common_Recommendation_Set_Setup')
        .where('Common_Recommendation_Set_Setup.id', '=', recommendationSetSetupId)
        .where('Common_Recommendation_Set_Setup._deleted', '=', false)
        .where('Common_Publication_Selection.egcs_cn_kind', '=', 'recommendation_set_setup')
        .where('Common_Publication_Selection.egcs_cn_dimension', '=', 'scope')
        .where('Common_Publication_Selection.egcs_cn_key', 'in', selectionKeys)
        .forUpdate()
        .executeTakeFirst()
  if (!setup) return null
  if (pinnedPublication && !pinnedPublicationVersionId) return null

  let versionQuery = db.selectFrom('Common_Publication')
    .innerJoin('Common_Publication_Version', 'Common_Publication_Version.egcs_cn_publication', 'Common_Publication.id')
    .select([
      'Common_Publication.egcs_cn_state as state',
      'Common_Publication_Version.id as versionId',
      'Common_Publication_Version.egcs_cn_version as version',
      'Common_Publication_Version.egcs_cn_definition as definition'
    ])
    .where('Common_Publication.id', '=', recommendationSetSetupId)
    .where('Common_Publication.egcs_cn_kind', '=', 'recommendation_set_setup')
    .where('Common_Publication._deleted', '=', false)
  versionQuery = pinnedPublicationVersionId
    ? versionQuery.where('Common_Publication_Version.id', '=', pinnedPublicationVersionId)
    : versionQuery.where('Common_Publication.egcs_cn_state', '=', 'published')
        .whereRef('Common_Publication_Version.id', '=', 'Common_Publication.egcs_cn_currentversion')
  const version = await versionQuery.executeTakeFirst()
  if (!version || (!allowHistoricalVersions && version.state !== 'published')) return null
  if (pinnedPublicationVersion !== undefined && Number(version.version) !== pinnedPublicationVersion) return null
  const publication = pinnedPublication ?? readPublishedRecommendationPlan(version.definition)
  if (publication.recommendationSetId !== recommendationSetSetupId
    || !setupScopes.some(scope => scope.scopeType === publication.scopeType && scope.scopeId === publication.scopeId)) return null

  const members = await Promise.all(publication.members.map(member => readPinnedRecommendationSchema(
    db,
    member,
    !allowHistoricalVersions
  )))
  if (members.length === 0 || members.some(member => member === null)) return null
  const lockedMembers = members as LockedRecommendationMember[]
  const agencies = await db.selectFrom('Common_Recommendation_Schema')
    .select(['id', 'egcs_cn_agency'])
    .where('id', 'in', lockedMembers.map(member => member.schemaId))
    .where('_deleted', '=', false)
    .execute()
  const agencyBySchemaId = new Map(agencies.map(row => [String(row.id), String(row.egcs_cn_agency)]))
  if (lockedMembers.some(member => agencyBySchemaId.get(member.schemaId) !== ownerAgencyId)) return null
  if (!await validatePinnedApprovals(db, publication, lockedMembers, !allowHistoricalVersions)) return null

  return {
    recommendationSetSetup: setup,
    publication,
    publicationVersionId: String(version.versionId),
    publicationVersion: Number(version.version),
    members: lockedMembers.sort((left, right) => left.order - right.order)
  }
}

export const fetchRuntimeRecommendation = async (db: DbClient, recommendationId: string) => {
  if (!isPositivePostgresBigintText(recommendationId)) return null
  const row = await db.selectFrom('Common_Recommendation')
    .innerJoin('Common_Runtime_Item as Recommendation_Item', 'Recommendation_Item.id', 'Common_Recommendation.egcs_cn_runtimeitem')
    .innerJoin('Common_Runtime', 'Common_Runtime.id', 'Recommendation_Item.egcs_cn_runtime')
    .innerJoin('Common_Publication_Version as Schema_Version', 'Schema_Version.id', 'Recommendation_Item.egcs_cn_publicationversion')
    .selectAll('Common_Recommendation')
    .select([
      'Common_Runtime.id as runtimeId',
      'Common_Runtime.egcs_cn_entitytype as runtimeEntityType',
      'Common_Runtime.egcs_cn_entityid as runtimeEntityId',
      'Common_Runtime.egcs_cn_state as rootRuntimeState',
      'Common_Runtime.egcs_cn_attempt as attempt',
      'Common_Runtime.egcs_cn_previousruntime as previousRuntimeId',
      'Recommendation_Item.id as runtimeItemId',
      'Recommendation_Item.egcs_cn_state as runtimeState',
      'Recommendation_Item.egcs_cn_publication as publicationId',
      'Schema_Version.id as publicationVersionId',
      'Schema_Version.egcs_cn_version as publicationVersion',
      'Schema_Version.egcs_cn_definition as publicationDefinition'
    ])
    .where('Common_Recommendation.id', '=', recommendationId)
    .where('Common_Recommendation._deleted', '=', false)
    .where('Recommendation_Item._deleted', '=', false)
    .where('Common_Runtime.egcs_cn_kind', '=', 'workflow')
    .where('Common_Runtime._deleted', '=', false)
    .executeTakeFirst()
  if (!row) return null
  const schema = readPublishedRecommendationSchema(row.publicationDefinition)
  return {
    ...row,
    id: String(row.id),
    egcs_cn_recommendationset: String(row.egcs_cn_recommendationset),
    egcs_cn_recommendationsetup: String(row.egcs_cn_recommendationsetup),
    egcs_cn_entityid: String(row.egcs_cn_entityid),
    egcs_cn_runtimeitem: String(row.egcs_cn_runtimeitem),
    runtimeId: String(row.runtimeId),
    runtimeItemId: String(row.runtimeItemId),
    attempt: Number(row.attempt),
    previousRuntimeId: row.previousRuntimeId === null ? null : String(row.previousRuntimeId),
    publicationId: String(row.publicationId),
    publicationVersionId: String(row.publicationVersionId),
    publicationVersion: Number(row.publicationVersion),
    definition: schema.definition,
    name_en: schema.nameEn,
    name_fr: schema.nameFr,
    workflow_run_id: String(row.runtimeId),
    workflow_entity_type: row.runtimeEntityType,
    workflow_entity_id: String(row.runtimeEntityId)
  }
}

export const fetchRuntimeRecommendationSetWithRecommendations = async (
  db: DbClient,
  recommendationSetId: string,
  entityType: Entity_Type,
  entityId: string
) => {
  const set = await db.selectFrom('Common_Recommendation_Set')
    .innerJoin('Common_Runtime_Item as Set_Item', 'Set_Item.id', 'Common_Recommendation_Set.egcs_cn_runtimeitem')
    .innerJoin('Common_Runtime', 'Common_Runtime.id', 'Set_Item.egcs_cn_runtime')
    .innerJoin('Common_Publication_Version as Set_Version', 'Set_Version.id', 'Set_Item.egcs_cn_publicationversion')
    .select([
      'Common_Recommendation_Set.id',
      'Common_Recommendation_Set.egcs_cn_recommendationsetsetup',
      'Common_Recommendation_Set.egcs_cn_entitytype',
      'Common_Recommendation_Set.egcs_cn_entityid',
      'Common_Recommendation_Set.egcs_cn_runtimeitem',
      'Common_Runtime.id as runtimeId',
      'Common_Runtime.egcs_cn_state as rootRuntimeState',
      'Common_Runtime.egcs_cn_attempt as attempt',
      'Common_Runtime.egcs_cn_previousruntime as previousRuntimeId',
      'Set_Item.egcs_cn_state as runtimeState',
      'Set_Version.id as publicationVersionId',
      'Set_Version.egcs_cn_version as publicationVersion',
      'Set_Version.egcs_cn_definition as definition'
    ])
    .where('Common_Recommendation_Set.id', '=', recommendationSetId)
    .where('Common_Recommendation_Set.egcs_cn_entitytype', '=', entityType)
    .where('Common_Recommendation_Set.egcs_cn_entityid', '=', entityId)
    .where('Common_Recommendation_Set._deleted', '=', false)
    .where('Set_Item._deleted', '=', false)
    .where('Common_Runtime.egcs_cn_kind', '=', 'workflow')
    .where('Common_Runtime._deleted', '=', false)
    .executeTakeFirst()
  if (!set) return null
  const configuration = readPublishedRecommendationPlan(set.definition)
  const recommendations = await db.selectFrom('Common_Recommendation')
    .innerJoin('Common_Runtime_Item as Recommendation_Item', 'Recommendation_Item.id', 'Common_Recommendation.egcs_cn_runtimeitem')
    .innerJoin('Common_Publication_Version as Schema_Version', 'Schema_Version.id', 'Recommendation_Item.egcs_cn_publicationversion')
    .selectAll('Common_Recommendation')
    .select([
      'Recommendation_Item.id as runtimeItemId',
      'Recommendation_Item.egcs_cn_order as order',
      'Recommendation_Item.egcs_cn_state as runtimeState',
      'Schema_Version.id as publicationVersionId',
      'Schema_Version.egcs_cn_version as publicationVersion',
      'Schema_Version.egcs_cn_definition as definition'
    ])
    .where('Common_Recommendation.egcs_cn_recommendationset', '=', recommendationSetId)
    .where('Common_Recommendation._deleted', '=', false)
    .where('Recommendation_Item._deleted', '=', false)
    .orderBy('Recommendation_Item.egcs_cn_order', 'asc')
    .execute()
  return {
    id: String(set.id),
    egcs_cn_recommendationsetsetup: String(set.egcs_cn_recommendationsetsetup),
    egcs_cn_entitytype: set.egcs_cn_entitytype,
    egcs_cn_entityid: String(set.egcs_cn_entityid),
    egcs_cn_runtimeitem: String(set.egcs_cn_runtimeitem),
    runtimeId: String(set.runtimeId),
    runtimeItemId: String(set.egcs_cn_runtimeitem),
    runtimeState: set.runtimeState,
    rootRuntimeState: set.rootRuntimeState,
    attempt: Number(set.attempt),
    previousRuntimeId: set.previousRuntimeId === null ? null : String(set.previousRuntimeId),
    publicationVersionId: String(set.publicationVersionId),
    publicationVersion: Number(set.publicationVersion),
    name_en: configuration.nameEn,
    name_fr: configuration.nameFr,
    description_en: configuration.descriptionEn,
    description_fr: configuration.descriptionFr,
    recommendations: recommendations.map(recommendation => {
      const schema = readPublishedRecommendationSchema(recommendation.definition)
      return {
        ...recommendation,
        id: String(recommendation.id),
        egcs_cn_recommendationset: String(recommendation.egcs_cn_recommendationset),
        egcs_cn_recommendationsetup: String(recommendation.egcs_cn_recommendationsetup),
        egcs_cn_entityid: String(recommendation.egcs_cn_entityid),
        egcs_cn_runtimeitem: String(recommendation.egcs_cn_runtimeitem),
        runtimeItemId: String(recommendation.runtimeItemId),
        publicationVersionId: String(recommendation.publicationVersionId),
        publicationVersion: Number(recommendation.publicationVersion),
        definition: schema.definition,
        name_en: schema.nameEn,
        name_fr: schema.nameFr
      }
    })
  }
}

const insertRecommendation = async (
  db: Transaction<Database>,
  input: {
    runtimeId: string
    setItemId: string
    setId: string
    entityType: Entity_Type
    entityId: string
    member: LockedRecommendationMember
    actorId: string
  }
) => {
  const runtimeItemId = await createRuntimeItem(db, {
    egcs_cn_runtime: input.runtimeId,
    egcs_cn_parentruntimeitem: input.setItemId,
    egcs_cn_kind: 'recommendation',
    egcs_cn_order: input.member.order,
    egcs_cn_publication: input.member.schemaId,
    egcs_cn_publicationkind: 'recommendation_schema',
    egcs_cn_publicationversion: input.member.schemaVersionId,
    egcs_cn_version: input.member.schemaVersion
  })
  const recommendation = await db.insertInto('Common_Recommendation').values({
    egcs_cn_recommendationset: input.setId,
    egcs_cn_recommendationsetup: input.member.memberId,
    egcs_cn_entitytype: input.entityType,
    egcs_cn_entityid: input.entityId,
    egcs_cn_runtimeitem: runtimeItemId,
    egcs_cn_response: { responses: [] },
    _deleted: false
  }).returning('id').executeTakeFirstOrThrow()
  await createPrimaryEntityAssignment(
    db,
    'commonrecommendation',
    String(recommendation.id),
    input.member.defaultOwnerId ?? input.actorId
  )
  return { recommendationId: String(recommendation.id), runtimeItemId }
}

export const createRuntimeRecommendationSetInTransaction = async (
  input: CreateRuntimeRecommendationSetTransactionInput
) => {
  const snapshot = await lockEligibleRuntimeRecommendationSetSetupSnapshot(
    input.db,
    input.recommendationSetSetupId,
    input.entityType,
    input.ownerAgencyId,
    input.setupScopes,
    input.publication,
    input.publicationVersionId,
    input.publicationVersion,
    true
  )
  if (!snapshot) return null
  const existing = await input.db.selectFrom('Common_Recommendation_Set')
    .innerJoin('Common_Runtime_Item', 'Common_Runtime_Item.id', 'Common_Recommendation_Set.egcs_cn_runtimeitem')
    .select('Common_Recommendation_Set.id')
    .where('Common_Recommendation_Set.egcs_cn_recommendationsetsetup', '=', input.recommendationSetSetupId)
    .where('Common_Recommendation_Set.egcs_cn_entitytype', '=', input.entityType)
    .where('Common_Recommendation_Set.egcs_cn_entityid', '=', input.entityId)
    .where('Common_Runtime_Item.egcs_cn_state', 'not in', [...RUNTIME_TERMINAL_STATES])
    .where('Common_Recommendation_Set._deleted', '=', false)
    .where('Common_Runtime_Item._deleted', '=', false)
    .executeTakeFirst()
  if (existing) return 'IN_PROGRESS_EXISTS' as const

  const runtime = await input.db.selectFrom('Common_Runtime').selectAll()
    .where('id', '=', input.runtimeId)
    .where('egcs_cn_kind', '=', 'workflow')
    .where('egcs_cn_entitytype', '=', input.entityType)
    .where('egcs_cn_entityid', '=', input.entityId)
    .where('egcs_cn_state', 'not in', [...RUNTIME_TERMINAL_STATES])
    .where('_deleted', '=', false)
    .forUpdate()
    .executeTakeFirst()
  if (!runtime) return null
  const pinnedByWorkflow = await input.db.selectFrom('Common_Publication_Version_Reference')
    .select('egcs_cn_parentversion')
    .where('egcs_cn_parentversion', '=', String(runtime.egcs_cn_sourcepublicationversion))
    .where('egcs_cn_publicationversion', '=', snapshot.publicationVersionId)
    .executeTakeFirst()
  if (!pinnedByWorkflow) return null
  const runtimeId = String(runtime.id)
  const rootOrder = input.runtimeItemOrder ?? Number((await input.db.selectFrom('Common_Runtime_Item')
    .select(eb => eb.fn.max('egcs_cn_order').as('maximum'))
    .where('egcs_cn_runtime', '=', runtimeId)
    .where('egcs_cn_parentruntimeitem', 'is', null)
    .executeTakeFirst())?.maximum ?? 0) + 1
  const setItemId = await createRuntimeItem(input.db, {
    egcs_cn_runtime: runtimeId,
    egcs_cn_parentruntimeitem: null,
    egcs_cn_kind: 'recommendation_set',
    egcs_cn_order: rootOrder,
    egcs_cn_publication: input.recommendationSetSetupId,
    egcs_cn_publicationkind: 'recommendation_set_setup',
    egcs_cn_publicationversion: snapshot.publicationVersionId,
    egcs_cn_version: snapshot.publicationVersion
  })
  const set = await input.db.insertInto('Common_Recommendation_Set').values({
    egcs_cn_recommendationsetsetup: input.recommendationSetSetupId,
    egcs_cn_entitytype: input.entityType,
    egcs_cn_entityid: input.entityId,
    egcs_cn_runtimeitem: setItemId,
    _deleted: false
  }).returning('id').executeTakeFirstOrThrow()
  const created = []
  for (const member of snapshot.members) {
    created.push(await insertRecommendation(input.db, {
      runtimeId,
      setItemId,
      setId: String(set.id),
      entityType: input.entityType,
      entityId: input.entityId,
      member: {
        ...member,
        ...(input.ownerByMemberId?.get(member.memberId)
          ? { defaultOwnerId: input.ownerByMemberId.get(member.memberId) }
          : {})
      },
      actorId: input.creatorCommonUserId
    }))
  }
  await transitionRuntimeItem(input.db, {
    runtimeId,
    runtimeItemId: setItemId,
    from: 'pending',
    to: 'active',
    actorId: input.creatorCommonUserId,
    reason: 'recommendation_set_materialized'
  })
  const first = created[0]
  if (first) {
    await transitionRuntimeItem(input.db, {
      runtimeId,
      runtimeItemId: first.runtimeItemId,
      from: 'pending',
      to: 'active',
      actorId: input.creatorCommonUserId,
      reason: 'recommendation_ready'
    })
  }
  return await fetchRuntimeRecommendationSetWithRecommendations(
    input.db,
    String(set.id),
    input.entityType,
    input.entityId
  )
}

const cancelRecommendationSiblings = async (
  db: Transaction<Database>,
  input: { runtimeId: string, setItemId: string, actorId?: string, reason: string }
) => {
  const siblings = await db.selectFrom('Common_Runtime_Item')
    .select(['id', 'egcs_cn_state'])
    .where('egcs_cn_parentruntimeitem', '=', input.setItemId)
    .where('egcs_cn_kind', '=', 'recommendation')
    .where('_deleted', '=', false)
    .forUpdate()
    .execute()
  for (const sibling of siblings) {
    if (!RUNTIME_TERMINAL_STATES.has(sibling.egcs_cn_state)) {
      await transitionRuntimeItem(db, {
        runtimeId: input.runtimeId,
        runtimeItemId: String(sibling.id),
        from: sibling.egcs_cn_state,
        to: 'cancelled',
        actorId: input.actorId,
        reason: input.reason
      })
    }
  }
}

export const advanceRecommendationRuntimeAfterTerminalItem = async (
  db: Transaction<Database>,
  recommendationId: string,
  actorId?: string
) => {
  const current = await db.selectFrom('Common_Recommendation')
    .innerJoin('Common_Recommendation_Set', 'Common_Recommendation_Set.id', 'Common_Recommendation.egcs_cn_recommendationset')
    .innerJoin('Common_Runtime_Item as Recommendation_Item', 'Recommendation_Item.id', 'Common_Recommendation.egcs_cn_runtimeitem')
    .innerJoin('Common_Runtime_Item as Set_Item', 'Set_Item.id', 'Common_Recommendation_Set.egcs_cn_runtimeitem')
    .innerJoin('Common_Runtime', 'Common_Runtime.id', 'Recommendation_Item.egcs_cn_runtime')
    .innerJoin('Common_Publication_Version as Set_Version', 'Set_Version.id', 'Set_Item.egcs_cn_publicationversion')
    .select([
      'Common_Recommendation.id',
      'Common_Recommendation.egcs_cn_recommendationset',
      'Common_Recommendation.egcs_cn_recommendationsetup as memberId',
      'Common_Recommendation.egcs_cn_outcome as outcome',
      'Common_Recommendation_Set.egcs_cn_entitytype as entityType',
      'Common_Recommendation_Set.egcs_cn_entityid as entityId',
      'Recommendation_Item.egcs_cn_order as recommendationOrder',
      'Recommendation_Item.egcs_cn_state as recommendationState',
      'Set_Item.id as setItemId',
      'Set_Item.egcs_cn_state as setState',
      'Common_Runtime.id as runtimeId',
      'Set_Version.egcs_cn_definition as setDefinition'
    ])
    .where('Common_Recommendation.id', '=', recommendationId)
    .where('Common_Recommendation._deleted', '=', false)
    .where('Common_Recommendation_Set._deleted', '=', false)
    .where('Common_Runtime.egcs_cn_kind', '=', 'workflow')
    .forUpdate(['Common_Recommendation', 'Recommendation_Item', 'Set_Item', 'Common_Runtime'])
    .executeTakeFirst()
  if (!current || !RUNTIME_TERMINAL_STATES.has(current.recommendationState)
    || RUNTIME_TERMINAL_STATES.has(current.setState)) return null
  const configuration = readPublishedRecommendationPlan(current.setDefinition)
  const currentMember = configuration.members.find(member => member.memberId === String(current.memberId))
  if (!currentMember) throw new Error('Pinned recommendation member is missing from its set publication')
  const configuredNegative = current.outcome === 'not_recommended' && currentMember.failOnNotRecommended
  const positive = (current.recommendationState === 'succeeded' || current.recommendationState === 'approved')
    && !configuredNegative
  const siblings = await db.selectFrom('Common_Runtime_Item')
    .select(['id', 'egcs_cn_order', 'egcs_cn_state'])
    .where('egcs_cn_parentruntimeitem', '=', String(current.setItemId))
    .where('egcs_cn_kind', '=', 'recommendation')
    .where('_deleted', '=', false)
    .orderBy('egcs_cn_order', 'asc')
    .forUpdate()
    .execute()
  if (positive) {
    const next = siblings.find(item => item.egcs_cn_order > current.recommendationOrder
      && item.egcs_cn_state === 'pending')
    if (next) {
      await transitionRuntimeItem(db, {
        runtimeId: String(current.runtimeId),
        runtimeItemId: String(next.id),
        from: 'pending',
        to: 'active',
        actorId,
        reason: 'predecessor_completed'
      })
      return await db.selectFrom('Common_Recommendation').selectAll()
        .where('egcs_cn_runtimeitem', '=', String(next.id)).executeTakeFirst()
    }
  } else {
    await cancelRecommendationSiblings(db, {
      runtimeId: String(current.runtimeId),
      setItemId: String(current.setItemId),
      actorId,
      reason: 'recommendation_set_short_circuit'
    })
  }
  const recommendationRows = await db.selectFrom('Common_Recommendation')
    .innerJoin('Common_Runtime_Item', 'Common_Runtime_Item.id', 'Common_Recommendation.egcs_cn_runtimeitem')
    .select([
      'Common_Recommendation.egcs_cn_recommendationsetup as memberId',
      'Common_Recommendation.egcs_cn_outcome as outcome',
      'Common_Runtime_Item.egcs_cn_state as state'
    ])
    .where('Common_Recommendation.egcs_cn_recommendationset', '=', String(current.egcs_cn_recommendationset))
    .where('Common_Recommendation._deleted', '=', false)
    .where('Common_Runtime_Item._deleted', '=', false)
    .execute()
  if (recommendationRows.some(row => !RUNTIME_TERMINAL_STATES.has(row.state))) return null
  const hasConfiguredNegative = recommendationRows.some(row => row.outcome === 'not_recommended'
    && configuration.members.find(member => member.memberId === String(row.memberId))?.failOnNotRecommended === true)
  const states = recommendationRows.map(row => row.state)
  if (configuration.finalApproval && !hasConfiguredNegative
    && states.every(state => state === 'succeeded' || state === 'approved')) {
    return {
      kind: 'final_approval_required' as const,
      recommendationSetRuntimeItemId: String(current.setItemId),
      entityType: current.entityType,
      entityId: String(current.entityId),
      nameEn: configuration.nameEn,
      nameFr: configuration.nameFr,
      approval: configuration.finalApproval
    }
  }
  const to = reduceRuntimeState(states, {
    approvalBacked: states.includes('approved'),
    configuredNegative: hasConfiguredNegative
  })
  await transitionRuntimeItem(db, {
    runtimeId: String(current.runtimeId),
    runtimeItemId: String(current.setItemId),
    from: current.setState,
    to,
    actorId,
    reason: 'recommendation_set_aggregated'
  })
  const { advanceWorkflowAfterRecommendationSet } = await import('./workflow-runtime')
  await advanceWorkflowAfterRecommendationSet(db, String(current.egcs_cn_recommendationset), actorId)
  return null
}

/**
 * Advances a Workflow after a Recommendation Set's optional final Approval reaches terminus.
 * @param db - Open Workflow transaction.
 * @param recommendationSetId - Recommendation Set whose final Approval terminated.
 * @param actorId - Common user responsible for the terminal action.
 * @returns The terminal Recommendation Set state, or null when it is not ready.
 */
export const advanceRecommendationSetRuntimeAfterTerminalItem = async (
  db: Transaction<Database>,
  recommendationSetId: string,
  actorId?: string
) => {
  const context = await db.selectFrom('Common_Recommendation_Set')
    .innerJoin('Common_Runtime_Item', 'Common_Runtime_Item.id', 'Common_Recommendation_Set.egcs_cn_runtimeitem')
    .innerJoin('Common_Runtime', 'Common_Runtime.id', 'Common_Runtime_Item.egcs_cn_runtime')
    .select([
      'Common_Runtime.id as runtimeId',
      'Common_Runtime.egcs_cn_kind as runtimeKind',
      'Common_Runtime_Item.egcs_cn_state as recommendationSetState'
    ])
    .where('Common_Recommendation_Set.id', '=', recommendationSetId)
    .where('Common_Recommendation_Set._deleted', '=', false)
    .where('Common_Runtime_Item._deleted', '=', false)
    .where('Common_Runtime._deleted', '=', false)
    .forUpdate(['Common_Runtime_Item', 'Common_Runtime'])
    .executeTakeFirst()
  if (!context || !RUNTIME_TERMINAL_STATES.has(context.recommendationSetState)) return null
  if (context.runtimeKind === 'workflow') {
    const { advanceWorkflowAfterRecommendationSet } = await import('./workflow-runtime')
    await advanceWorkflowAfterRecommendationSet(db, recommendationSetId, actorId)
  }
  return context.recommendationSetState
}

export const saveRecommendationById = async (
  event: H3Event,
  recommendationId: string,
  responses: RecommendationResponse[],
  submit: boolean,
  userId: string,
  existingTrx?: Transaction<Database>,
  expectedRevision?: number
) => {
  const executeSave = async (trx: Transaction<Database>) => {
    const recommendation = await trx.selectFrom('Common_Recommendation')
      .innerJoin('Common_Runtime_Item as Recommendation_Item', 'Recommendation_Item.id', 'Common_Recommendation.egcs_cn_runtimeitem')
      .innerJoin('Common_Runtime_Item as Set_Item', join => join
        .onRef('Set_Item.egcs_cn_runtime', '=', 'Recommendation_Item.egcs_cn_runtime')
        .onRef('Set_Item.id', '=', 'Recommendation_Item.egcs_cn_parentruntimeitem'))
      .innerJoin('Common_Publication_Version as Schema_Version', 'Schema_Version.id', 'Recommendation_Item.egcs_cn_publicationversion')
      .innerJoin('Common_Publication_Version as Set_Version', 'Set_Version.id', 'Set_Item.egcs_cn_publicationversion')
      .selectAll('Common_Recommendation')
      .select([
        'Recommendation_Item.id as runtimeItemId',
        'Recommendation_Item.egcs_cn_runtime as runtimeId',
        'Recommendation_Item.egcs_cn_state as runtimeState',
        'Schema_Version.egcs_cn_definition as schemaDefinition',
        'Set_Version.egcs_cn_definition as setDefinition'
      ])
      .where('Common_Recommendation.id', '=', recommendationId)
      .where('Common_Recommendation._deleted', '=', false)
      .where('Recommendation_Item._deleted', '=', false)
      .forUpdate(['Common_Recommendation', 'Recommendation_Item', 'Set_Item'])
      .executeTakeFirst()
    if (!recommendation) {
      return await notFound(event, 'WORKFLOW_RECOMMENDATION_NOT_FOUND', 'apiErrors.admin_common.not_found')
    }
    const currentRevision = Number(recommendation.egcs_cn_revision ?? 1)
    if (expectedRevision !== undefined && currentRevision !== expectedRevision) {
      return await throwApiError(event, {
        statusCode: 409,
        code: 'RECOMMENDATION_REVISION_CONFLICT',
        key: 'apiErrors.workflow.recommendation_revision_conflict'
      })
    }
    if (recommendation.runtimeState !== 'active') return await forbidden(event)
    const publishedSchema = readPublishedRecommendationSchema(recommendation.schemaDefinition)
    const definition = RecommendationDefinitionSchema.parse(publishedSchema.definition)
    if (submit) {
      const issues = validateRecommendationResponses(definition, responses)
      if (issues.length > 0) {
        return await badRequest(event, 'WORKFLOW_RECOMMENDATION_INVALID', 'apiErrors.workflow.recommendation_invalid')
      }
    }
    const derived = submit ? deriveRecommendationOutcome(definition, responses) : null
    if (submit && !derived) {
      return await badRequest(
        event,
        'WORKFLOW_RECOMMENDATION_RESULT_REQUIRED',
        'apiErrors.workflow.recommendation_result_required'
      )
    }
    const updated = await trx.updateTable('Common_Recommendation').set({
      egcs_cn_response: { responses },
      egcs_cn_revision: currentRevision + 1,
      ...(derived
        ? { egcs_cn_resultoptionkey: derived.optionKey, egcs_cn_outcome: derived.outcome }
        : {})
    }).where('id', '=', recommendationId).returningAll().executeTakeFirstOrThrow()
    if (!submit) return updated

    const setConfiguration = readPublishedRecommendationPlan(recommendation.setDefinition)
    const member = setConfiguration.members.find(candidate => candidate.memberId
      === String(recommendation.egcs_cn_recommendationsetup))
    if (!member) throw new Error('Pinned recommendation member is missing from its set publication')
    if (member.approvalTemplateId && member.approvalVersionId) {
      await materializeCanonicalApprovalRuntime(trx, {
        entityType: 'commonrecommendation',
        entityId: recommendationId,
        nameEn: publishedSchema.nameEn,
        nameFr: publishedSchema.nameFr,
        approvalTemplateId: member.approvalTemplateId,
        approvalTemplateVersionId: member.approvalVersionId,
        parentRuntimeItemId: String(recommendation.runtimeItemId),
        actorId: userId
      })
      return await fetchRuntimeRecommendation(trx, recommendationId)
    }
    await transitionRuntimeItem(trx, {
      runtimeId: String(recommendation.runtimeId),
      runtimeItemId: String(recommendation.runtimeItemId),
      from: 'active',
      to: derived!.outcome === 'not_recommended' && member.failOnNotRecommended
        ? 'unsuccessful'
        : 'succeeded',
      actorId: userId,
      reason: 'recommendation_submitted'
    })
    const aggregation = await advanceRecommendationRuntimeAfterTerminalItem(trx, recommendationId, userId)
    if (aggregation && 'kind' in aggregation && aggregation.kind === 'final_approval_required') {
      await materializeCanonicalApprovalRuntime(trx, {
        entityType: aggregation.entityType,
        entityId: aggregation.entityId,
        nameEn: aggregation.nameEn,
        nameFr: aggregation.nameFr,
        approvalTemplateId: aggregation.approval.publicationId,
        approvalTemplateVersionId: aggregation.approval.publicationVersionId,
        actorId: userId,
        parentRuntimeItemId: aggregation.recommendationSetRuntimeItemId,
        purpose: 'standard'
      })
    }
    return await fetchRuntimeRecommendation(trx, recommendationId)
  }
  return existingTrx
    ? await executeSave(existingTrx)
    : await event.context.$db.transaction().execute(executeSave)
}

export const saveCurrentRecommendation = async (
  event: H3Event,
  context: ReviewRuntimeEntityContext,
  responses: RecommendationResponse[],
  submit: boolean,
  userId: string,
  existingTrx?: Transaction<Database>,
  purpose: Workflow_Purpose = 'standard',
  expectedRevision?: number
) => {
  const executeSave = async (trx: Transaction<Database>) => {
    const recommendation = await trx.selectFrom('Common_Recommendation')
      .innerJoin('Common_Runtime_Item', 'Common_Runtime_Item.id', 'Common_Recommendation.egcs_cn_runtimeitem')
      .innerJoin('Common_Runtime', 'Common_Runtime.id', 'Common_Runtime_Item.egcs_cn_runtime')
      .select('Common_Recommendation.id')
      .where('Common_Runtime.egcs_cn_kind', '=', 'workflow')
      .where('Common_Runtime.egcs_cn_entitytype', '=', context.entityType)
      .where('Common_Runtime.egcs_cn_entityid', '=', context.entityId)
      .where('Common_Runtime.egcs_cn_purpose', '=', purpose)
      .where('Common_Runtime.egcs_cn_state', '=', 'active')
      .where('Common_Runtime._deleted', '=', false)
      .where('Common_Runtime_Item.egcs_cn_state', '=', 'active')
      .where('Common_Runtime_Item.egcs_cn_kind', '=', 'recommendation')
      .where('Common_Runtime_Item._deleted', '=', false)
      .where('Common_Recommendation._deleted', '=', false)
      .orderBy('Common_Runtime_Item.egcs_cn_order', 'asc')
      .forUpdate('Common_Recommendation')
      .executeTakeFirst()
    if (!recommendation) {
      return await notFound(event, 'WORKFLOW_RECOMMENDATION_NOT_FOUND', 'apiErrors.admin_common.not_found')
    }
    return await saveRecommendationById(
      event,
      String(recommendation.id),
      responses,
      submit,
      userId,
      trx,
      expectedRevision
    )
  }
  return existingTrx
    ? await executeSave(existingTrx)
    : await event.context.$db.transaction().execute(executeSave)
}
