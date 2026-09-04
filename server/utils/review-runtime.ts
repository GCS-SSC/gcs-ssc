/* eslint-disable jsdoc/require-jsdoc -- typed review runtime helpers */
import type { Kysely, Selectable, Transaction } from 'kysely'
import { RUNTIME_TERMINAL_STATES } from '~~/shared/constants/system-lifecycle'
import type { CommonScopeEntityType, Database, Entity_Type, JsonValue } from '~~/shared/types/database'
import { badRequest, notFound } from './api-errors'
import { createPrimaryEntityAssignment } from './entity-assignment'
import { readPublishedReviewSetup, type PublishedReviewSetupConfiguration, type PublishedReviewSetupMember } from './review-setup-versioning'
import { readPublishedReviewSchema, type PublishedReviewSchemaDefinition } from './review-schema-versioning'
import { createRuntime, createRuntimeItem, reduceRuntimeState, retryRuntime, transitionRuntime, transitionRuntimeItem } from './system-runtime'

type DbClient = Kysely<Database> | Transaction<Database>
type CreateRuntimeReviewSetInput = {
  db: Kysely<Database>
  reviewSetSetupId: string
  entityType: Entity_Type
  entityId: string
  creatorCommonUserId: string
  workflowSetupMemberId?: string
  ownerByMemberId?: Map<string, string>
}
type CreateRuntimeReviewSetTransactionInput = Omit<CreateRuntimeReviewSetInput, 'db'> & {
  db: Transaction<Database>
  ownerAgencyId: string
  setupScopes: ReviewRuntimeSetupScope[]
  publication?: PublishedReviewSetupConfiguration
  publicationVersionId?: string
  publicationVersion?: number
  runtimeId?: string
  runtimeItemOrder?: number
}
export type ReviewRuntimeSetupScope = { scopeType: CommonScopeEntityType, scopeId: string }
type LockedMember = {
  memberId: string
  order: number
  schemaId: string
  schemaPublicationVersionId: string
  schemaPublicationVersion: number
  schemaDefinition: PublishedReviewSchemaDefinition
  approvalTemplateId?: string
  approvalTemplateVersionId?: string
  failOnChecklistFailure: boolean
  failureThreshold: number | null
  defaultOwnerId?: string
}
type LockedSetup = {
  reviewSetSetup: Selectable<Database['Common_Review_Set_Setup']>
  publication: PublishedReviewSetupConfiguration
  publicationVersionId: string
  publicationVersion: number
  members: LockedMember[]
}

export const readRuntimeReviewConfiguration = (value: JsonValue): PublishedReviewSetupConfiguration =>
  readPublishedReviewSetup(value)

const readSchemaVersion = async (
  db: DbClient,
  member: PublishedReviewSetupMember,
  requirePublished: boolean
): Promise<LockedMember | null> => {
  let query = db.selectFrom('Common_Publication_Version')
    .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Publication_Version.egcs_cn_publication')
    .select([
      'Common_Publication_Version.id as versionId',
      'Common_Publication_Version.egcs_cn_version as version',
      'Common_Publication_Version.egcs_cn_definition as definition'
    ])
    .where('Common_Publication.id', '=', member.schema.publicationId)
    .where('Common_Publication.egcs_cn_kind', '=', 'review_schema')
    .where('Common_Publication_Version.id', '=', member.schema.publicationVersionId)
    .where('Common_Publication_Version.egcs_cn_version', '=', member.schema.publicationVersion)
    .where('Common_Publication._deleted', '=', false)
  if (requirePublished) query = query.where('Common_Publication.egcs_cn_state', '=', 'published')
  const row = await query.executeTakeFirst()
  if (!row) return null
  const definition = readPublishedReviewSchema(row.definition)
  if (!definition
    || definition.reviewSchemaId !== member.schema.publicationId
    || definition.reviewType !== member.reviewType) return null
  return {
    memberId: member.memberId,
    order: member.order,
    schemaId: member.schema.publicationId,
    schemaPublicationVersionId: String(row.versionId),
    schemaPublicationVersion: Number(row.version),
    schemaDefinition: definition,
    ...(member.approval
      ? {
          approvalTemplateId: member.approval.publicationId,
          approvalTemplateVersionId: member.approval.publicationVersionId
        }
      : {}),
    failOnChecklistFailure: member.failOnChecklistFailure,
    failureThreshold: member.failureThreshold
  }
}

export const fetchRuntimeReviewSetSetup = async (
  db: DbClient,
  reviewSetSetupId: string,
  _entityType: Entity_Type
) => await db.selectFrom('Common_Review_Set_Setup')
  .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Review_Set_Setup.id')
  .innerJoin('Common_Publication_Version', 'Common_Publication_Version.id', 'Common_Publication.egcs_cn_currentversion')
  .selectAll('Common_Review_Set_Setup')
  .select([
    'Common_Publication_Version.id as publicationVersionId',
    'Common_Publication_Version.egcs_cn_version as publicationVersion',
    'Common_Publication_Version.egcs_cn_definition as publicationDefinition'
  ])
  .where('Common_Review_Set_Setup.id', '=', reviewSetSetupId)
  .where('Common_Review_Set_Setup._deleted', '=', false)
  .where('Common_Publication.egcs_cn_state', '=', 'published')
  .where('Common_Publication._deleted', '=', false)
  .executeTakeFirst()

export const listEligibleRuntimeReviewSetSetupIds = async (
  db: DbClient,
  entityType: Entity_Type,
  ownerAgencyId: string,
  setupScopes: ReviewRuntimeSetupScope[]
): Promise<string[]> => {
  if (setupScopes.length === 0) return []
  const rows = await db.selectFrom('Common_Review_Set_Setup')
    .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Review_Set_Setup.id')
    .innerJoin('Common_Publication_Version', 'Common_Publication_Version.id', 'Common_Publication.egcs_cn_currentversion')
    .select(['Common_Review_Set_Setup.id', 'Common_Publication_Version.egcs_cn_definition as definition'])
    .where('Common_Review_Set_Setup._deleted', '=', false)
    .where('Common_Publication.egcs_cn_state', '=', 'published')
    .where('Common_Publication._deleted', '=', false)
    .execute()
  const eligible: string[] = []
  for (const row of rows) {
    const definition = readPublishedReviewSetup(row.definition)
    if (definition.entityType !== entityType
      || !setupScopes.some(scope => scope.scopeType === definition.scopeType && scope.scopeId === definition.scopeId)) continue
    const members = await Promise.all(definition.members.map(member => readSchemaVersion(db, member, true)))
    if (members.length > 0 && members.every(member => member?.schemaDefinition.agencyId === ownerAgencyId
      && member.schemaDefinition.entityType === entityType)) eligible.push(String(row.id))
  }
  return eligible
}

export const lockEligibleRuntimeReviewSetSetupSnapshot = async (
  db: Transaction<Database>,
  reviewSetSetupId: string,
  entityType: Entity_Type,
  ownerAgencyId: string,
  setupScopes: ReviewRuntimeSetupScope[],
  pinnedPublication?: PublishedReviewSetupConfiguration,
  pinnedPublicationVersionId?: string,
  pinnedPublicationVersion?: number,
  allowHistoricalVersions = false
): Promise<LockedSetup | null> => {
  const setup = await db.selectFrom('Common_Review_Set_Setup').selectAll()
    .where('Common_Review_Set_Setup.id', '=', reviewSetSetupId)
    .where('Common_Review_Set_Setup._deleted', '=', false).forUpdate().executeTakeFirst()
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
    .where('Common_Publication.id', '=', reviewSetSetupId)
    .where('Common_Publication.egcs_cn_kind', '=', 'review_set_setup')
    .where('Common_Publication._deleted', '=', false)
  versionQuery = pinnedPublicationVersionId
    ? versionQuery.where('Common_Publication_Version.id', '=', pinnedPublicationVersionId)
    : versionQuery.where('Common_Publication.egcs_cn_state', '=', 'published')
        .whereRef('Common_Publication_Version.id', '=', 'Common_Publication.egcs_cn_currentversion')
  const version = await versionQuery.executeTakeFirst()
  if (!version || (!allowHistoricalVersions && version.state !== 'published')) return null
  if (pinnedPublicationVersion !== undefined && Number(version.version) !== pinnedPublicationVersion) return null
  const publication = pinnedPublication ?? readPublishedReviewSetup(version.definition)
  if (publication.kind !== 'review_set_setup' || publication.reviewSetupId !== reviewSetSetupId
    || publication.entityType !== entityType
    || !setupScopes.some(scope => scope.scopeType === publication.scopeType && scope.scopeId === publication.scopeId)) return null
  const members = await Promise.all(publication.members.map(member => readSchemaVersion(
    db,
    member,
    !allowHistoricalVersions
  )))
  if (members.some(member => member === null)) return null
  const lockedMembers = members as LockedMember[]
  if (lockedMembers.some(member => member.schemaDefinition.agencyId !== ownerAgencyId
    || member.schemaDefinition.entityType !== entityType)) return null
  const approvalIds = [publication.finalApproval, ...publication.members.map(member => member.approval)]
    .filter(reference => reference !== undefined).map(reference => reference.publicationId)
  if (approvalIds.length > 0) {
    let approvalsQuery = db.selectFrom('Common_Publication').select('id')
      .where('id', 'in', approvalIds).where('egcs_cn_kind', '=', 'approval_template')
      .where('_deleted', '=', false)
    if (!allowHistoricalVersions) approvalsQuery = approvalsQuery.where('egcs_cn_state', '=', 'published')
    const approvals = await approvalsQuery.execute()
    if (new Set(approvals.map(row => String(row.id))).size !== new Set(approvalIds).size) return null
  }
  return {
    reviewSetSetup: setup,
    publication,
    publicationVersionId: String(version.versionId),
    publicationVersion: Number(version.version),
    members: lockedMembers.sort((left, right) => left.order - right.order)
  }
}

export const fetchRuntimeReviewSetWithReviews = async (
  db: DbClient,
  reviewSetId: string,
  entityType: Entity_Type,
  entityId: string
) => {
  const set = await db.selectFrom('Common_Review_Set')
    .innerJoin('Common_Runtime_Item as Set_Item', 'Set_Item.id', 'Common_Review_Set.egcs_cn_runtimeitem')
    .innerJoin('Common_Runtime', 'Common_Runtime.id', 'Set_Item.egcs_cn_runtime')
    .innerJoin('Common_Publication_Version as Set_Version', 'Set_Version.id', 'Set_Item.egcs_cn_publicationversion')
    .select([
      'Common_Review_Set.id', 'Common_Review_Set.egcs_cn_reviewsetsetup',
      'Common_Review_Set.egcs_cn_entitytype', 'Common_Review_Set.egcs_cn_entityid',
      'Common_Review_Set.egcs_cn_runtimeitem', 'Common_Runtime.id as runtimeId',
      'Set_Item.egcs_cn_state as runtimeState', 'Common_Runtime.egcs_cn_attempt as attempt',
      'Common_Runtime.egcs_cn_previousruntime as previousRuntimeId',
      'Set_Version.id as publicationVersionId', 'Set_Version.egcs_cn_version as publicationVersion',
      'Set_Version.egcs_cn_definition as definition'
    ])
    .where('Common_Review_Set.id', '=', reviewSetId)
    .where('Common_Review_Set.egcs_cn_entitytype', '=', entityType)
    .where('Common_Review_Set.egcs_cn_entityid', '=', entityId)
    .where('Common_Review_Set._deleted', '=', false).where('Set_Item._deleted', '=', false)
    .where('Common_Runtime._deleted', '=', false).executeTakeFirst()
  if (!set) return null
  const configuration = readPublishedReviewSetup(set.definition)
  const reviews = await db.selectFrom('Common_Review')
    .innerJoin('Common_Runtime_Item as Review_Item', 'Review_Item.id', 'Common_Review.egcs_cn_runtimeitem')
    .innerJoin('Common_Publication_Version as Schema_Version', 'Schema_Version.id', 'Review_Item.egcs_cn_publicationversion')
    .select([
      'Common_Review.id', 'Common_Review.egcs_cn_reviewresult', 'Common_Review.egcs_cn_reviewset',
      'Common_Review.egcs_cn_reviewschema', 'Common_Review.egcs_cn_runtimeitem',
      'Common_Review.egcs_cn_disablecustomoutcomes', 'Common_Review.egcs_cn_disablealignment',
      'Common_Review.egcs_cn_disablereviewers', 'Common_Review.egcs_cn_failonchecklistfailure',
      'Common_Review.egcs_cn_failurethreshold', 'Review_Item.egcs_cn_order as order',
      'Review_Item.egcs_cn_state as runtimeState', 'Schema_Version.id as publicationVersionId',
      'Schema_Version.egcs_cn_version as publicationVersion', 'Schema_Version.egcs_cn_definition as definition'
    ])
    .where('Common_Review.egcs_cn_reviewset', '=', reviewSetId).where('Common_Review._deleted', '=', false)
    .where('Review_Item._deleted', '=', false).orderBy('Review_Item.egcs_cn_order', 'asc').execute()
  return {
    id: String(set.id),
    egcs_cn_reviewsetsetup: String(set.egcs_cn_reviewsetsetup),
    egcs_cn_entitytype: set.egcs_cn_entitytype,
    egcs_cn_entityid: String(set.egcs_cn_entityid),
    runtimeId: String(set.runtimeId),
    runtimeItemId: String(set.egcs_cn_runtimeitem),
    runtimeState: set.runtimeState,
    attempt: Number(set.attempt),
    previousRuntimeId: set.previousRuntimeId === null ? null : String(set.previousRuntimeId),
    publicationVersionId: String(set.publicationVersionId),
    publicationVersion: Number(set.publicationVersion),
    egcs_cn_name_en: configuration.name.en,
    egcs_cn_name_fr: configuration.name.fr,
    egcs_cn_sequential: configuration.sequential,
    reviews: reviews.map(review => {
      const schema = readPublishedReviewSchema(review.definition)
      if (!schema) throw new Error(`Runtime review ${review.id} has an invalid pinned schema definition`)
      return {
        ...review,
        id: String(review.id),
        egcs_cn_reviewset: String(review.egcs_cn_reviewset),
        egcs_cn_reviewschema: String(review.egcs_cn_reviewschema),
        runtimeItemId: String(review.egcs_cn_runtimeitem),
        publicationVersionId: String(review.publicationVersionId),
        publicationVersion: Number(review.publicationVersion),
        egcs_cn_reviewresult: review.egcs_cn_reviewresult === null ? null : Number(review.egcs_cn_reviewresult),
        egcs_cn_reviewtype: schema.reviewType,
        egcs_cn_name_en: schema.name.en,
        egcs_cn_name_fr: schema.name.fr
      }
    })
  }
}

const insertReview = async (
  db: Transaction<Database>,
  input: { runtimeId: string, setItemId: string, setId: string, member: LockedMember, actorId: string }
) => {
  const runtimeItemId = await createRuntimeItem(db, {
    egcs_cn_runtime: input.runtimeId,
    egcs_cn_parentruntimeitem: input.setItemId,
    egcs_cn_kind: 'review',
    egcs_cn_order: input.member.order,
    egcs_cn_publication: input.member.schemaId,
    egcs_cn_publicationkind: 'review_schema',
    egcs_cn_publicationversion: input.member.schemaPublicationVersionId,
    egcs_cn_version: input.member.schemaPublicationVersion
  })
  const definition = input.member.schemaDefinition
  const review = await db.insertInto('Common_Review').values({
    egcs_cn_helpers: null,
    egcs_cn_reviewresult: definition.reviewType === 'assessment' ? 0 : null,
    egcs_cn_reviewset: input.setId,
    egcs_cn_reviewschema: input.member.schemaId,
    egcs_cn_runtimeitem: runtimeItemId,
    egcs_cn_disablecustomoutcomes: definition.disableCustomOutcomes,
    egcs_cn_disablealignment: definition.disableAlignment,
    egcs_cn_disablereviewers: definition.disableReviewers,
    egcs_cn_failonchecklistfailure: input.member.failOnChecklistFailure,
    egcs_cn_failurethreshold: input.member.failureThreshold,
    _deleted: false
  }).returning('id').executeTakeFirstOrThrow()
  await createPrimaryEntityAssignment(db, 'commonreview', String(review.id), input.member.defaultOwnerId ?? input.actorId)
  if (definition.reviewType === 'checklist') {
    await db.insertInto('Common_Checklist').values({ egcs_cn_review: String(review.id), _deleted: false }).execute()
  } else {
    await db.insertInto('Common_Assessment').values({
      egcs_cn_review: String(review.id), egcs_cn_reviewresult: 0,
      egcs_cn_disablecustomoutcomes: definition.disableCustomOutcomes,
      egcs_cn_disablealignment: definition.disableAlignment, _deleted: false
    }).execute()
  }
  return { reviewId: String(review.id), runtimeItemId }
}

export const createRuntimeReviewSetInTransaction = async (input: CreateRuntimeReviewSetTransactionInput) => {
  const snapshot = await lockEligibleRuntimeReviewSetSetupSnapshot(
    input.db, input.reviewSetSetupId, input.entityType, input.ownerAgencyId, input.setupScopes,
    input.publication, input.publicationVersionId, input.publicationVersion,
    Boolean(input.runtimeId)
  )
  if (!snapshot) return null
  const existing = await input.db.selectFrom('Common_Review_Set')
    .innerJoin('Common_Runtime_Item', 'Common_Runtime_Item.id', 'Common_Review_Set.egcs_cn_runtimeitem')
    .select('Common_Review_Set.id').where('Common_Review_Set.egcs_cn_reviewsetsetup', '=', input.reviewSetSetupId)
    .where('Common_Review_Set.egcs_cn_entitytype', '=', input.entityType)
    .where('Common_Review_Set.egcs_cn_entityid', '=', input.entityId)
    .where('Common_Runtime_Item.egcs_cn_state', 'not in', [...RUNTIME_TERMINAL_STATES])
    .where('Common_Review_Set._deleted', '=', false).where('Common_Runtime_Item._deleted', '=', false).executeTakeFirst()
  if (existing) return 'IN_PROGRESS_EXISTS' as const
  const existingRuntimeId = input.runtimeId
  const runtime = existingRuntimeId
    ? await input.db.selectFrom('Common_Runtime').selectAll().where('id', '=', existingRuntimeId)
        .where('egcs_cn_kind', '=', 'workflow').where('egcs_cn_entitytype', '=', input.entityType)
        .where('egcs_cn_entityid', '=', input.entityId).where('_deleted', '=', false).forUpdate().executeTakeFirst()
    : null
  if (existingRuntimeId && !runtime) return null
  if (runtime) {
    const pinnedByWorkflow = await input.db.selectFrom('Common_Publication_Version_Reference')
      .select('egcs_cn_parentversion')
      .where('egcs_cn_parentversion', '=', String(runtime.egcs_cn_sourcepublicationversion))
      .where('egcs_cn_publicationversion', '=', snapshot.publicationVersionId)
      .executeTakeFirst()
    if (!pinnedByWorkflow) return null
  }
  const runtimeMetadata = runtime
    ? {
        runtimeId: String(runtime.id), runtimeState: runtime.egcs_cn_state,
        attempt: Number(runtime.egcs_cn_attempt),
        previousRuntimeId: runtime.egcs_cn_previousruntime === null ? null : String(runtime.egcs_cn_previousruntime)
      }
    : await createRuntime(input.db, {
        kind: 'review_set', entityType: input.entityType, entityId: input.entityId,
        sourcePublicationId: input.reviewSetSetupId, sourcePublicationKind: 'review_set_setup',
        sourcePublicationVersionId: snapshot.publicationVersionId, sourceVersion: snapshot.publicationVersion,
        initiatedBy: input.creatorCommonUserId
      })
  const rootOrder = input.runtimeItemOrder ?? (runtime
    ? Number((await input.db.selectFrom('Common_Runtime_Item')
      .select(eb => eb.fn.max('egcs_cn_order').as('maximum')).where('egcs_cn_runtime', '=', runtimeMetadata.runtimeId)
      .where('egcs_cn_parentruntimeitem', 'is', null).executeTakeFirst())?.maximum ?? 0) + 1
    : 1)
  const setItemId = await createRuntimeItem(input.db, {
    egcs_cn_runtime: runtimeMetadata.runtimeId, egcs_cn_parentruntimeitem: null,
    egcs_cn_kind: 'review_set', egcs_cn_order: rootOrder, egcs_cn_publication: input.reviewSetSetupId,
    egcs_cn_publicationkind: 'review_set_setup', egcs_cn_publicationversion: snapshot.publicationVersionId,
    egcs_cn_version: snapshot.publicationVersion
  })
  const set = await input.db.insertInto('Common_Review_Set').values({
    egcs_cn_reviewsetsetup: input.reviewSetSetupId, egcs_cn_entitytype: input.entityType,
    egcs_cn_entityid: input.entityId, egcs_cn_runtimeitem: setItemId, _deleted: false
  }).returning('id').executeTakeFirstOrThrow()
  const created = []
  for (const member of snapshot.members) {
    created.push(await insertReview(input.db, {
      runtimeId: runtimeMetadata.runtimeId, setItemId, setId: String(set.id),
      member: { ...member, ...(input.ownerByMemberId?.get(member.memberId)
        ? { defaultOwnerId: input.ownerByMemberId.get(member.memberId) }
        : {}) },
      actorId: input.creatorCommonUserId
    }))
  }
  if (!runtime) await transitionRuntime(input.db, {
    runtimeId: runtimeMetadata.runtimeId, from: 'pending', to: 'active', actorId: input.creatorCommonUserId,
    reason: 'review_set_materialized'
  })
  await transitionRuntimeItem(input.db, {
    runtimeId: runtimeMetadata.runtimeId, runtimeItemId: setItemId, from: 'pending', to: 'active',
    actorId: input.creatorCommonUserId, reason: 'review_set_materialized'
  })
  for (const [index, review] of created.entries()) {
    if (snapshot.publication.sequential && index > 0) continue
    await transitionRuntimeItem(input.db, {
      runtimeId: runtimeMetadata.runtimeId, runtimeItemId: review.runtimeItemId,
      from: 'pending', to: 'active', actorId: input.creatorCommonUserId, reason: 'review_ready'
    })
  }
  return await fetchRuntimeReviewSetWithReviews(input.db, String(set.id), input.entityType, input.entityId)
}

export const createRuntimeReviewSet = async (input: CreateRuntimeReviewSetInput) =>
  await input.db.transaction().execute(async trx => {
    const setup = await fetchRuntimeReviewSetSetup(trx, input.reviewSetSetupId, input.entityType)
    if (!setup) return null
    const publication = readPublishedReviewSetup(setup.publicationDefinition)
    if (publication.entityType !== input.entityType) return null
    const first = publication.members[0] ? await readSchemaVersion(trx, publication.members[0], true) : null
    if (!first) return null
    return await createRuntimeReviewSetInTransaction({
      ...input, db: trx, ownerAgencyId: first.schemaDefinition.agencyId,
      setupScopes: [{ scopeType: publication.scopeType, scopeId: publication.scopeId }],
      publication, publicationVersionId: String(setup.publicationVersionId),
      publicationVersion: Number(setup.publicationVersion)
    })
  })

const isConfiguredNegative = async (db: Transaction<Database>, review: {
  id: string | number
  egcs_cn_reviewresult: number | null
  egcs_cn_failonchecklistfailure: boolean
  egcs_cn_failurethreshold: number | null
}) => {
  const checklist = review.egcs_cn_failonchecklistfailure
    ? await db.selectFrom('Common_Checklist').select('egcs_cn_result')
        .where('egcs_cn_review', '=', String(review.id)).where('_deleted', '=', false).executeTakeFirst()
    : null
  return (review.egcs_cn_failonchecklistfailure && checklist?.egcs_cn_result === 'fail')
    || (review.egcs_cn_failurethreshold !== null && review.egcs_cn_reviewresult !== null
      && Number(review.egcs_cn_reviewresult) < Number(review.egcs_cn_failurethreshold))
}

export const activateRetriedApprovalRuntime = async (
  db: Transaction<Database>,
  parentRuntimeItemId: string,
  actorId?: string
): Promise<boolean> => {
  const routing = await db.selectFrom('Common_Routing_Slip')
    .innerJoin('Common_Runtime_Item as Routing_Item', 'Routing_Item.id', 'Common_Routing_Slip.egcs_cn_runtimeitem')
    .innerJoin('Common_Runtime_Item as Parent_Item', 'Parent_Item.id', 'Routing_Item.egcs_cn_parentruntimeitem')
    .select([
      'Routing_Item.egcs_cn_runtime as runtimeId',
      'Routing_Item.id as routingItemId',
      'Routing_Item.egcs_cn_state as routingState',
      'Parent_Item.egcs_cn_state as parentState',
      'Common_Routing_Slip.id as routingSlipId'
    ])
    .where('Routing_Item.egcs_cn_parentruntimeitem', '=', parentRuntimeItemId)
    .where('Routing_Item.egcs_cn_kind', '=', 'routing_slip')
    .where('Routing_Item.egcs_cn_state', '=', 'pending')
    .where('Common_Routing_Slip._deleted', '=', false)
    .where('Routing_Item._deleted', '=', false)
    .forUpdate(['Routing_Item', 'Parent_Item'])
    .executeTakeFirst()
  if (!routing || (routing.parentState !== 'active' && routing.parentState !== 'pending')) return false
  const firstApproval = await db.selectFrom('Common_Approval')
    .innerJoin('Common_Runtime_Item', 'Common_Runtime_Item.id', 'Common_Approval.egcs_cn_runtimeitem')
    .select(['Common_Runtime_Item.id as runtimeItemId', 'Common_Runtime_Item.egcs_cn_state as state'])
    .where('Common_Approval.egcs_cn_routingslip', '=', String(routing.routingSlipId))
    .orderBy('Common_Approval.egcs_cn_sequence', 'asc')
    .orderBy('Common_Approval.id', 'asc')
    .forUpdate('Common_Runtime_Item')
    .executeTakeFirst()
  if (!firstApproval || firstApproval.state !== 'pending') return false
  await transitionRuntimeItem(db, {
    runtimeId: String(routing.runtimeId),
    runtimeItemId: parentRuntimeItemId,
    from: routing.parentState,
    to: 'awaiting_action',
    actorId,
    reason: 'retried_approval_activated'
  })
  await transitionRuntimeItem(db, {
    runtimeId: String(routing.runtimeId),
    runtimeItemId: String(routing.routingItemId),
    from: 'pending',
    to: 'awaiting_action',
    actorId,
    reason: 'retried_approval_activated'
  })
  await transitionRuntimeItem(db, {
    runtimeId: String(routing.runtimeId),
    runtimeItemId: String(firstApproval.runtimeItemId),
    from: 'pending',
    to: 'awaiting_action',
    actorId,
    reason: 'retried_approval_activated'
  })
  return true
}

export const advanceReviewRuntimeAfterTerminalItem = async (
  db: Transaction<Database>, reviewId: string, actorId?: string
) => {
  const current = await db.selectFrom('Common_Review')
    .innerJoin('Common_Review_Set', 'Common_Review_Set.id', 'Common_Review.egcs_cn_reviewset')
    .innerJoin('Common_Runtime_Item as Review_Item', 'Review_Item.id', 'Common_Review.egcs_cn_runtimeitem')
    .innerJoin('Common_Runtime_Item as Set_Item', 'Set_Item.id', 'Common_Review_Set.egcs_cn_runtimeitem')
    .innerJoin('Common_Runtime', 'Common_Runtime.id', 'Review_Item.egcs_cn_runtime')
    .innerJoin('Common_Publication_Version as Set_Version', 'Set_Version.id', 'Set_Item.egcs_cn_publicationversion')
    .select([
      'Common_Review.id', 'Common_Review.egcs_cn_reviewset', 'Common_Review.egcs_cn_reviewresult',
      'Common_Review.egcs_cn_failonchecklistfailure',
      'Common_Review.egcs_cn_failurethreshold', 'Review_Item.egcs_cn_order as reviewOrder',
      'Common_Review_Set.egcs_cn_entitytype as entityType',
      'Common_Review_Set.egcs_cn_entityid as entityId',
      'Review_Item.egcs_cn_state as reviewState', 'Set_Item.id as setItemId',
      'Set_Item.egcs_cn_state as setState', 'Common_Runtime.id as runtimeId',
      'Common_Runtime.egcs_cn_kind as runtimeKind', 'Common_Runtime.egcs_cn_state as rootState',
      'Set_Version.egcs_cn_definition as setDefinition'
    ])
    .where('Common_Review.id', '=', reviewId).where('Common_Review._deleted', '=', false)
    .where('Common_Review_Set._deleted', '=', false)
    .where('Review_Item._deleted', '=', false).where('Set_Item._deleted', '=', false)
    .where('Common_Runtime._deleted', '=', false)
    .forUpdate(['Common_Review', 'Review_Item', 'Set_Item', 'Common_Runtime']).executeTakeFirst()
  if (!current || !RUNTIME_TERMINAL_STATES.has(current.reviewState)
    || RUNTIME_TERMINAL_STATES.has(current.setState)) return null
  const configuration = readPublishedReviewSetup(current.setDefinition)
  const currentConfiguredNegative = await isConfiguredNegative(db, current)
  const positive = current.reviewState === 'succeeded' || current.reviewState === 'approved'
  const siblings = await db.selectFrom('Common_Runtime_Item').select(['id', 'egcs_cn_order', 'egcs_cn_state'])
    .where('egcs_cn_parentruntimeitem', '=', String(current.setItemId)).where('egcs_cn_kind', '=', 'review')
    .where('_deleted', '=', false).orderBy('egcs_cn_order', 'asc').forUpdate().execute()
  if (configuration.sequential && positive && !currentConfiguredNegative) {
    const next = siblings.find(item => item.egcs_cn_order > current.reviewOrder && item.egcs_cn_state === 'pending')
    if (next) {
      await transitionRuntimeItem(db, {
        runtimeId: String(current.runtimeId), runtimeItemId: String(next.id), from: 'pending', to: 'active',
        actorId, reason: 'predecessor_completed'
      })
      return await db.selectFrom('Common_Review').selectAll().where('egcs_cn_runtimeitem', '=', String(next.id)).executeTakeFirst()
    }
  }
  const shortCircuit = (configuration.sequential && (!positive || currentConfiguredNegative))
    || current.reviewState === 'denied'
    || current.reviewState === 'failed'
  if (shortCircuit) {
    for (const sibling of siblings) {
      if (!RUNTIME_TERMINAL_STATES.has(sibling.egcs_cn_state)) await transitionRuntimeItem(db, {
        runtimeId: String(current.runtimeId), runtimeItemId: String(sibling.id), from: sibling.egcs_cn_state,
        to: 'cancelled', actorId, reason: 'review_set_short_circuit'
      })
    }
  }
  const states = (await db.selectFrom('Common_Runtime_Item').select('egcs_cn_state')
    .where('egcs_cn_parentruntimeitem', '=', String(current.setItemId)).where('egcs_cn_kind', '=', 'review')
    .where('_deleted', '=', false).execute()).map(item => item.egcs_cn_state)
  if (states.some(state => !RUNTIME_TERMINAL_STATES.has(state))) return null
  const completedReviews = await db.selectFrom('Common_Review')
    .innerJoin('Common_Runtime_Item', 'Common_Runtime_Item.id', 'Common_Review.egcs_cn_runtimeitem')
    .select([
      'Common_Review.id',
      'Common_Review.egcs_cn_reviewresult',
      'Common_Review.egcs_cn_failonchecklistfailure',
      'Common_Review.egcs_cn_failurethreshold'
    ])
    .where('Common_Review.egcs_cn_reviewset', '=', String(current.egcs_cn_reviewset))
    .where('Common_Review._deleted', '=', false)
    .where('Common_Runtime_Item._deleted', '=', false)
    .forUpdate('Common_Review')
    .execute()
  let configuredNegative = false
  for (const review of completedReviews) {
    if (await isConfiguredNegative(db, review)) {
      configuredNegative = true
      break
    }
  }
  if (configuration.finalApproval && !configuredNegative
    && states.every(state => state === 'succeeded' || state === 'approved')) {
    return {
      kind: 'final_approval_required' as const,
      reviewSetRuntimeItemId: String(current.setItemId),
      entityType: current.entityType,
      entityId: String(current.entityId),
      nameEn: configuration.name.en,
      nameFr: configuration.name.fr,
      approval: configuration.finalApproval
    }
  }
  const to = reduceRuntimeState(states, { approvalBacked: states.includes('approved'), configuredNegative })
  await transitionRuntimeItem(db, {
    runtimeId: String(current.runtimeId), runtimeItemId: String(current.setItemId), from: current.setState,
    to, actorId, reason: 'review_set_aggregated'
  })
  if (current.runtimeKind === 'review_set' && !RUNTIME_TERMINAL_STATES.has(current.rootState)) {
    await transitionRuntime(db, {
      runtimeId: String(current.runtimeId), from: current.rootState, to, actorId, reason: 'review_set_aggregated'
    })
  } else if (current.runtimeKind === 'workflow') {
    const { advanceWorkflowAfterReviewSet } = await import('./workflow-runtime')
    await advanceWorkflowAfterReviewSet(db, String(current.egcs_cn_reviewset), actorId)
  }
  return null
}

export const advanceSequentialRuntimeReviewSet = advanceReviewRuntimeAfterTerminalItem

export const advanceReviewSetRuntimeAfterTerminalItem = async (
  db: Transaction<Database>,
  reviewSetId: string,
  actorId?: string
) => {
  const context = await db.selectFrom('Common_Review_Set')
    .innerJoin('Common_Runtime_Item', 'Common_Runtime_Item.id', 'Common_Review_Set.egcs_cn_runtimeitem')
    .innerJoin('Common_Runtime', 'Common_Runtime.id', 'Common_Runtime_Item.egcs_cn_runtime')
    .select([
      'Common_Runtime.id as runtimeId',
      'Common_Runtime.egcs_cn_kind as runtimeKind',
      'Common_Runtime.egcs_cn_state as rootState',
      'Common_Runtime_Item.egcs_cn_state as reviewSetState'
    ])
    .where('Common_Review_Set.id', '=', reviewSetId)
    .where('Common_Review_Set._deleted', '=', false)
    .where('Common_Runtime_Item._deleted', '=', false)
    .where('Common_Runtime._deleted', '=', false)
    .forUpdate(['Common_Runtime_Item', 'Common_Runtime'])
    .executeTakeFirst()
  if (!context || !RUNTIME_TERMINAL_STATES.has(context.reviewSetState)) return null
  if (context.runtimeKind === 'review_set' && !RUNTIME_TERMINAL_STATES.has(context.rootState)) {
    await transitionRuntime(db, {
      runtimeId: String(context.runtimeId),
      from: context.rootState,
      to: context.reviewSetState,
      actorId,
      reason: 'review_set_final_approval_decided'
    })
  } else if (context.runtimeKind === 'workflow') {
    const { advanceWorkflowAfterReviewSet } = await import('./workflow-runtime')
    await advanceWorkflowAfterReviewSet(db, reviewSetId, actorId)
  }
  return context.reviewSetState
}

export const resumeSequentialRuntimeReviewSet = async (
  db: Transaction<Database>, reviewSetId: string, nestedMemberId: string, _ownerId: string
) => {
  const set = await db.selectFrom('Common_Review_Set')
    .innerJoin('Common_Runtime_Item as Set_Item', 'Set_Item.id', 'Common_Review_Set.egcs_cn_runtimeitem')
    .innerJoin('Common_Publication_Version', 'Common_Publication_Version.id', 'Set_Item.egcs_cn_publicationversion')
    .select(['Set_Item.egcs_cn_runtime as runtimeId', 'Common_Publication_Version.egcs_cn_definition as definition'])
    .where('Common_Review_Set.id', '=', reviewSetId).where('Common_Review_Set._deleted', '=', false)
    .where('Set_Item._deleted', '=', false).executeTakeFirst()
  if (!set) return null
  const member = readPublishedReviewSetup(set.definition).members.find(candidate => candidate.memberId === nestedMemberId)
  if (!member) return null
  const review = await db.selectFrom('Common_Review')
    .innerJoin('Common_Runtime_Item', 'Common_Runtime_Item.id', 'Common_Review.egcs_cn_runtimeitem')
    .select(['Common_Review.id', 'Common_Runtime_Item.id as itemId', 'Common_Runtime_Item.egcs_cn_state as state'])
    .where('Common_Review.egcs_cn_reviewset', '=', reviewSetId)
    .where('Common_Runtime_Item.egcs_cn_order', '=', member.order).where('Common_Review._deleted', '=', false)
    .where('Common_Runtime_Item._deleted', '=', false).executeTakeFirst()
  if (!review || (review.state !== 'pending' && review.state !== 'paused')) return null
  await transitionRuntimeItem(db, {
    runtimeId: String(set.runtimeId), runtimeItemId: String(review.itemId), from: review.state,
    to: 'active', reason: 'owner_blocker_resolved'
  })
  return review
}

const cancelWithTransaction = async (
  db: Transaction<Database>, reviewSetId: string, entityType: Entity_Type, entityId: string, actorId?: string
) => {
  const current = await db.selectFrom('Common_Review_Set')
    .innerJoin('Common_Runtime_Item', 'Common_Runtime_Item.id', 'Common_Review_Set.egcs_cn_runtimeitem')
    .innerJoin('Common_Runtime', 'Common_Runtime.id', 'Common_Runtime_Item.egcs_cn_runtime')
    .select([
      'Common_Review_Set.egcs_cn_runtimeitem as itemId', 'Common_Runtime_Item.egcs_cn_state as state',
      'Common_Runtime.id as runtimeId', 'Common_Runtime.egcs_cn_kind as runtimeKind',
      'Common_Runtime.egcs_cn_state as rootState'
    ])
    .where('Common_Review_Set.id', '=', reviewSetId).where('Common_Review_Set.egcs_cn_entitytype', '=', entityType)
    .where('Common_Review_Set.egcs_cn_entityid', '=', entityId).where('Common_Review_Set._deleted', '=', false)
    .forUpdate(['Common_Runtime_Item', 'Common_Runtime']).executeTakeFirst()
  if (!current) return null
  if (RUNTIME_TERMINAL_STATES.has(current.state)) return 'TERMINAL' as const
  const items = await db.selectFrom('Common_Runtime_Item').select(['id', 'egcs_cn_parentruntimeitem', 'egcs_cn_state'])
    .where('egcs_cn_runtime', '=', String(current.runtimeId)).where('_deleted', '=', false).forUpdate().execute()
  const descendants = new Set([String(current.itemId)])
  let added = true
  while (added) {
    added = false
    for (const item of items) if (item.egcs_cn_parentruntimeitem !== null
      && descendants.has(String(item.egcs_cn_parentruntimeitem)) && !descendants.has(String(item.id))) {
      descendants.add(String(item.id))
      added = true
    }
  }
  const depthOf = (itemId: string): number => {
    const visited = new Set<string>()
    let currentId: string | null = itemId
    let depth = 0
    while (currentId !== null) {
      if (visited.has(currentId)) throw new Error('Runtime item hierarchy contains a cycle')
      visited.add(currentId)
      const item = items.find(candidate => String(candidate.id) === currentId)
      if (!item?.egcs_cn_parentruntimeitem) return depth
      currentId = String(item.egcs_cn_parentruntimeitem)
      depth += 1
    }
    return depth
  }
  const targetedItems = items.filter(item => descendants.has(String(item.id)))
    .sort((left, right) => depthOf(String(right.id)) - depthOf(String(left.id)))
  for (const item of targetedItems) {
    if (!RUNTIME_TERMINAL_STATES.has(item.egcs_cn_state)) await transitionRuntimeItem(db, {
      runtimeId: String(current.runtimeId), runtimeItemId: String(item.id), from: item.egcs_cn_state,
      to: 'cancelled', actorId, reason: 'explicit_cancellation'
    })
  }
  if (current.runtimeKind === 'review_set' && !RUNTIME_TERMINAL_STATES.has(current.rootState)) {
    await transitionRuntime(db, {
      runtimeId: String(current.runtimeId), from: current.rootState, to: 'cancelled',
      actorId, reason: 'explicit_cancellation'
    })
  } else if (current.runtimeKind === 'workflow') {
    const { advanceWorkflowAfterReviewSet } = await import('./workflow-runtime')
    await advanceWorkflowAfterReviewSet(db, reviewSetId, actorId)
  }
  return await fetchRuntimeReviewSetWithReviews(db, reviewSetId, entityType, entityId)
}

export const cancelRuntimeReviewSetInTransaction = cancelWithTransaction
export const cancelRuntimeReviewSet = async (
  db: Kysely<Database>, reviewSetId: string, entityType: Entity_Type, entityId: string, actorId?: string
) => await db.transaction().execute(trx => cancelWithTransaction(trx, reviewSetId, entityType, entityId, actorId))

export const cloneDeniedRuntimeReview = async (
  db: Transaction<Database>,
  reviewSetId: string,
  reviewId: string,
  entityType: Entity_Type,
  entityId: string,
  actorId?: string
) => {
  const source = await db.selectFrom('Common_Review_Set')
    .innerJoin('Common_Runtime_Item as Set_Item', 'Set_Item.id', 'Common_Review_Set.egcs_cn_runtimeitem')
    .innerJoin('Common_Runtime', 'Common_Runtime.id', 'Set_Item.egcs_cn_runtime')
    .innerJoin('Common_Publication_Version', 'Common_Publication_Version.id', 'Set_Item.egcs_cn_publicationversion')
    .select([
      'Common_Review_Set.id',
      'Common_Review_Set.egcs_cn_reviewsetsetup',
      'Common_Runtime.id as runtimeId',
      'Common_Runtime.egcs_cn_kind as runtimeKind',
      'Common_Runtime.egcs_cn_state as runtimeState',
      'Common_Publication_Version.egcs_cn_definition as definition'
    ])
    .where('Common_Review_Set.id', '=', reviewSetId)
    .where('Common_Review_Set.egcs_cn_entitytype', '=', entityType)
    .where('Common_Review_Set.egcs_cn_entityid', '=', entityId)
    .where('Common_Review_Set._deleted', '=', false)
    .where('Set_Item._deleted', '=', false)
    .where('Common_Runtime._deleted', '=', false)
    .forUpdate(['Common_Runtime', 'Set_Item'])
    .executeTakeFirst()
  if (!source) return null
  if (source.runtimeKind !== 'review_set' || !RUNTIME_TERMINAL_STATES.has(source.runtimeState)) {
    return 'REVIEW_NOT_DENIED' as const
  }
  const sourceReviews = await db.selectFrom('Common_Review')
    .innerJoin('Common_Runtime_Item', 'Common_Runtime_Item.id', 'Common_Review.egcs_cn_runtimeitem')
    .leftJoin('Common_Entity_Assignment', join => join
      .onRef('Common_Entity_Assignment.egcs_cn_entityid', '=', 'Common_Review.id')
      .on('Common_Entity_Assignment.egcs_cn_entitytype', '=', 'commonreview')
      .on('Common_Entity_Assignment.egcs_cn_isprimary', '=', true)
      .on('Common_Entity_Assignment._deleted', '=', false))
    .select([
      'Common_Review.id',
      'Common_Review.egcs_cn_reviewschema',
      'Common_Review.egcs_cn_disablecustomoutcomes',
      'Common_Review.egcs_cn_disablealignment',
      'Common_Review.egcs_cn_disablereviewers',
      'Common_Review.egcs_cn_failonchecklistfailure',
      'Common_Review.egcs_cn_failurethreshold',
      'Common_Runtime_Item.egcs_cn_order as itemOrder',
      'Common_Runtime_Item.egcs_cn_state as itemState',
      'Common_Entity_Assignment.egcs_cn_user as primaryUserId'
    ])
    .where('Common_Review.egcs_cn_reviewset', '=', reviewSetId)
    .where('Common_Review._deleted', '=', false)
    .where('Common_Runtime_Item._deleted', '=', false)
    .orderBy('Common_Runtime_Item.egcs_cn_order', 'asc')
    .execute()
  const requested = sourceReviews.find(review => String(review.id) === reviewId)
  if (!requested) return 'REVIEW_NOT_FOUND' as const
  if (requested.itemState !== 'denied' && requested.itemState !== 'cancelled'
    && requested.itemState !== 'failed' && requested.itemState !== 'unsuccessful') {
    return 'REVIEW_NOT_DENIED' as const
  }
  const initiatedBy = actorId ?? (requested.primaryUserId === null ? null : String(requested.primaryUserId))
  if (!initiatedBy) return 'REVIEW_NOT_DENIED' as const
  // The source runtime row is locked above. Re-check for a successor while holding
  // that lock so duplicate and concurrent clone requests are idempotent.
  const existingSuccessor = await db.selectFrom('Common_Runtime as Successor_Runtime')
    .innerJoin('Common_Runtime_Item as Successor_Item', join => join
      .onRef('Successor_Item.egcs_cn_runtime', '=', 'Successor_Runtime.id')
      .on('Successor_Item.egcs_cn_kind', '=', 'review')
      .on('Successor_Item.egcs_cn_order', '=', requested.itemOrder)
      .on('Successor_Item._deleted', '=', false))
    .innerJoin('Common_Review as Successor_Review', 'Successor_Review.egcs_cn_runtimeitem', 'Successor_Item.id')
    .select(['Successor_Review.id', 'Successor_Review.egcs_cn_reviewset'])
    .where('Successor_Runtime.egcs_cn_previousruntime', '=', String(source.runtimeId))
    .where('Successor_Runtime._deleted', '=', false)
    .where('Successor_Review._deleted', '=', false)
    .executeTakeFirst()
  if (existingSuccessor) {
    const retried = await fetchRuntimeReviewSetWithReviews(
      db, String(existingSuccessor.egcs_cn_reviewset), entityType, entityId
    )
    return retried?.reviews.find(review => review.id === String(existingSuccessor.id)) ?? null
  }
  const successor = await retryRuntime(db, {
    previousRuntimeId: String(source.runtimeId),
    initiatedBy
  })
  const successorItems = await db.selectFrom('Common_Runtime_Item')
    .select(['id', 'egcs_cn_parentruntimeitem', 'egcs_cn_kind', 'egcs_cn_order', 'egcs_cn_state'])
    .where('egcs_cn_runtime', '=', successor.runtimeId)
    .where('_deleted', '=', false)
    .orderBy('egcs_cn_order', 'asc')
    .execute()
  const setItem = successorItems.find(item => item.egcs_cn_kind === 'review_set')
  if (!setItem) throw new Error('Review-set retry did not copy its root item')
  const newSet = await db.insertInto('Common_Review_Set').values({
    egcs_cn_reviewsetsetup: String(source.egcs_cn_reviewsetsetup),
    egcs_cn_entitytype: entityType,
    egcs_cn_entityid: entityId,
    egcs_cn_runtimeitem: String(setItem.id),
    _deleted: false
  }).returning('id').executeTakeFirstOrThrow()
  let requestedSuccessorReviewId: string | null = null
  const retriedReviewIds = new Map<string, string>()
  for (const sourceReview of sourceReviews) {
    const successorItem = successorItems.find(item => item.egcs_cn_kind === 'review'
      && item.egcs_cn_order === sourceReview.itemOrder)
    if (!successorItem) throw new Error('Review-set retry did not copy every review item')
    const review = await db.insertInto('Common_Review').values({
      egcs_cn_helpers: null,
      egcs_cn_reviewresult: 0,
      egcs_cn_reviewset: String(newSet.id),
      egcs_cn_reviewschema: String(sourceReview.egcs_cn_reviewschema),
      egcs_cn_runtimeitem: String(successorItem.id),
      egcs_cn_disablecustomoutcomes: sourceReview.egcs_cn_disablecustomoutcomes,
      egcs_cn_disablealignment: sourceReview.egcs_cn_disablealignment,
      egcs_cn_disablereviewers: sourceReview.egcs_cn_disablereviewers,
      egcs_cn_failonchecklistfailure: sourceReview.egcs_cn_failonchecklistfailure,
      egcs_cn_failurethreshold: sourceReview.egcs_cn_failurethreshold,
      _deleted: false
    }).returning('id').executeTakeFirstOrThrow()
    const ownerId = sourceReview.primaryUserId === null ? initiatedBy : String(sourceReview.primaryUserId)
    await createPrimaryEntityAssignment(db, 'commonreview', String(review.id), ownerId)
    const schemaType = await db.selectFrom('Common_Review_Schema').select('egcs_cn_reviewtype')
      .where('id', '=', String(sourceReview.egcs_cn_reviewschema)).executeTakeFirstOrThrow()
    if (schemaType.egcs_cn_reviewtype === 'checklist') {
      await db.insertInto('Common_Checklist').values({ egcs_cn_review: String(review.id), _deleted: false }).execute()
    } else {
      await db.insertInto('Common_Assessment').values({
        egcs_cn_review: String(review.id),
        egcs_cn_reviewresult: 0,
        egcs_cn_disablecustomoutcomes: sourceReview.egcs_cn_disablecustomoutcomes,
        egcs_cn_disablealignment: sourceReview.egcs_cn_disablealignment,
        _deleted: false
      }).execute()
    }
    if (String(sourceReview.id) === reviewId) requestedSuccessorReviewId = String(review.id)
    retriedReviewIds.set(String(sourceReview.id), String(review.id))
  }
  const sourceItems = await db.selectFrom('Common_Runtime_Item')
    .select(['id', 'egcs_cn_parentruntimeitem', 'egcs_cn_kind', 'egcs_cn_order'])
    .where('egcs_cn_runtime', '=', String(source.runtimeId))
    .where('_deleted', '=', false)
    .execute()
  const itemPath = (
    items: Array<{ id: string | number, egcs_cn_parentruntimeitem: string | number | null, egcs_cn_kind: string, egcs_cn_order: number }>,
    itemId: string
  ): string => {
    const item = items.find(candidate => String(candidate.id) === itemId)
    if (!item) throw new Error('Retry runtime item path is incomplete')
    const segment = `${item.egcs_cn_kind}:${item.egcs_cn_order}`
    return item.egcs_cn_parentruntimeitem === null
      ? segment
      : `${itemPath(items, String(item.egcs_cn_parentruntimeitem))}/${segment}`
  }
  const successorByPath = new Map(successorItems.map(item => [
    itemPath(successorItems, String(item.id)),
    item
  ]))
  const sourceRoutingSlips = await db.selectFrom('Common_Routing_Slip')
    .innerJoin('Common_Runtime_Item', 'Common_Runtime_Item.id', 'Common_Routing_Slip.egcs_cn_runtimeitem')
    .selectAll('Common_Routing_Slip')
    .select('Common_Runtime_Item.id as sourceRuntimeItemId')
    .where('Common_Runtime_Item.egcs_cn_runtime', '=', String(source.runtimeId))
    .where('Common_Routing_Slip._deleted', '=', false)
    .where('Common_Runtime_Item._deleted', '=', false)
    .execute()
  for (const sourceSlip of sourceRoutingSlips) {
    const successorItem = successorByPath.get(itemPath(sourceItems, String(sourceSlip.sourceRuntimeItemId)))
    if (!successorItem) throw new Error('Retry did not copy a routing-slip runtime item')
    const targetEntityId = sourceSlip.egcs_cn_entitytype === 'commonreview'
      ? retriedReviewIds.get(String(sourceSlip.egcs_cn_entityid))
      : String(sourceSlip.egcs_cn_entityid)
    if (!targetEntityId) throw new Error('Retry could not map a routing-slip review target')
    const newSlip = await db.insertInto('Common_Routing_Slip').values({
      egcs_cn_entitytype: sourceSlip.egcs_cn_entitytype,
      egcs_cn_entityid: targetEntityId,
      egcs_cn_name_en: sourceSlip.egcs_cn_name_en,
      egcs_cn_name_fr: sourceSlip.egcs_cn_name_fr,
      egcs_cn_approvaltemplate: String(sourceSlip.egcs_cn_approvaltemplate),
      egcs_cn_allowadditionalapprovals: sourceSlip.egcs_cn_allowadditionalapprovals,
      egcs_cn_defaultaddedapprovalname_en: sourceSlip.egcs_cn_defaultaddedapprovalname_en,
      egcs_cn_defaultaddedapprovalname_fr: sourceSlip.egcs_cn_defaultaddedapprovalname_fr,
      egcs_cn_allowaddedapprovalnamechanges: sourceSlip.egcs_cn_allowaddedapprovalnamechanges,
      egcs_cn_allowaddedapprovalcertificationchanges: sourceSlip.egcs_cn_allowaddedapprovalcertificationchanges,
      egcs_cn_runtimeitem: String(successorItem.id),
      _deleted: false
    }).returning('id').executeTakeFirstOrThrow()
    const routingCertifications = await db.selectFrom('Common_Certification').selectAll()
      .where('egcs_cn_routingslip', '=', String(sourceSlip.id)).where('_deleted', '=', false).execute()
    if (routingCertifications.length > 0) await db.insertInto('Common_Certification').values(
      routingCertifications.map(certification => ({
        egcs_cn_order: certification.egcs_cn_order,
        egcs_cn_description_en: certification.egcs_cn_description_en,
        egcs_cn_description_fr: certification.egcs_cn_description_fr,
        egcs_cn_name_en: certification.egcs_cn_name_en,
        egcs_cn_name_fr: certification.egcs_cn_name_fr,
        egcs_cn_optional: certification.egcs_cn_optional,
        egcs_cn_certification_en: certification.egcs_cn_certification_en,
        egcs_cn_certification_fr: certification.egcs_cn_certification_fr,
        egcs_cn_routingslip: String(newSlip.id),
        _deleted: false
      }))
    ).execute()
    const sourceApprovals = await db.selectFrom('Common_Approval')
      .innerJoin('Common_Runtime_Item', 'Common_Runtime_Item.id', 'Common_Approval.egcs_cn_runtimeitem')
      .selectAll('Common_Approval')
      .select('Common_Runtime_Item.id as sourceRuntimeItemId')
      .where('Common_Approval.egcs_cn_routingslip', '=', String(sourceSlip.id))
      .orderBy('Common_Approval.egcs_cn_sequence', 'asc')
      .execute()
    for (const sourceApproval of sourceApprovals) {
      const successorApprovalItem = successorByPath.get(itemPath(sourceItems, String(sourceApproval.sourceRuntimeItemId)))
      if (!successorApprovalItem) throw new Error('Retry did not copy an approval-step runtime item')
      const newApproval = await db.insertInto('Common_Approval').values({
        egcs_cn_runtimeitem: String(successorApprovalItem.id),
        egcs_cn_sequence: sourceApproval.egcs_cn_sequence,
        egcs_cn_name_en: sourceApproval.egcs_cn_name_en,
        egcs_cn_name_fr: sourceApproval.egcs_cn_name_fr,
        egcs_cn_routingslip: String(newSlip.id),
        egcs_cn_defaultuser: String(sourceApproval.egcs_cn_defaultuser),
        egcs_cn_assigneduser: String(sourceApproval.egcs_cn_defaultuser),
        egcs_cn_isadded: sourceApproval.egcs_cn_isadded
      }).returning('id').executeTakeFirstOrThrow()
      const approvalCertifications = await db.selectFrom('Common_Approval_Certification').selectAll()
        .where('egcs_cn_approval', '=', String(sourceApproval.id)).execute()
      if (approvalCertifications.length > 0) await db.insertInto('Common_Approval_Certification').values(
        approvalCertifications.map(certification => ({
          egcs_cn_optional: certification.egcs_cn_optional,
          egcs_cn_certification_en: certification.egcs_cn_certification_en,
          egcs_cn_certification_fr: certification.egcs_cn_certification_fr,
          egcs_cn_approval: String(newApproval.id)
        }))
      ).execute()
    }
  }
  const configuration = readPublishedReviewSetup(source.definition)
  await transitionRuntime(db, {
    runtimeId: successor.runtimeId,
    from: 'pending',
    to: 'active',
    actorId: initiatedBy,
    reason: 'review_set_retry_started'
  })
  await transitionRuntimeItem(db, {
    runtimeId: successor.runtimeId,
    runtimeItemId: String(setItem.id),
    from: 'pending',
    to: 'active',
    actorId: initiatedBy,
    reason: 'review_set_retry_started'
  })
  const successorReviewItems = successorItems
    .filter(candidate => candidate.egcs_cn_kind === 'review')
    .sort((left, right) => left.egcs_cn_order - right.egcs_cn_order)
  for (const [index, item] of successorReviewItems.entries()) {
    if (configuration.sequential && index > 0) continue
    await transitionRuntimeItem(db, {
      runtimeId: successor.runtimeId,
      runtimeItemId: String(item.id),
      from: 'pending',
      to: 'active',
      actorId: initiatedBy,
      reason: 'review_retry_ready'
    })
  }
  if (!requestedSuccessorReviewId) throw new Error('Review-set retry could not map the requested review')
  const retried = await fetchRuntimeReviewSetWithReviews(db, String(newSet.id), entityType, entityId)
  return retried?.reviews.find(review => review.id === requestedSuccessorReviewId) ?? null
}

export const assertRuntimeReviewSetCreationResult = async (
  event: Parameters<typeof badRequest>[0], result: Awaited<ReturnType<typeof createRuntimeReviewSet>>
) => {
  if (result === 'IN_PROGRESS_EXISTS') {
    return await badRequest(event, 'REVIEW_SET_ALREADY_IN_PROGRESS', 'apiErrors.review.review_set_already_in_progress')
  }
  if (result === null) return await notFound(
    event, 'REVIEW_SET_SETUP_NOT_FOUND', 'apiErrors.review.review_set_setup_not_found'
  )
  return null
}
