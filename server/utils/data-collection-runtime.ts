/* eslint-disable jsdoc/require-jsdoc -- Typed Data Collection runtime adapter. */
import type { H3Event } from 'h3'
import type { Kysely, Selectable, Transaction } from 'kysely'
import { RUNTIME_TERMINAL_STATES } from '~~/shared/constants/system-lifecycle'
import type { Database, Entity_Type, JsonValue } from '~~/shared/types/database'
import { DataCollectionDefinitionSchema } from '~~/shared/types/schemas/data-collection'
import { validateQuestionnaireResponses, type QuestionnaireResponse } from '~~/shared/types/schemas/questionnaire'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { notFound, throwApiError } from './api-errors'
import { materializeCanonicalApprovalRuntime } from './canonical-approval-runtime'
import { createPrimaryEntityAssignment } from './entity-assignment'
import { readPublishedDataCollectionSetup, type PublishedDataCollectionSetup } from './data-collection-setup-versioning'
import { saveQuestionnaireRuntimeInTransaction } from './questionnaire-runtime-save'
import { canonicalizePublicationDefinition } from './system-publication'
import { createRuntimeItem, transitionRuntimeItem } from './system-runtime'

type DbClient = Kysely<Database> | Transaction<Database>
export type LockedDataCollectionSetup = {
  dataCollectionSetup: Selectable<Database['Common_Data_Collection_Setup']>
  publication: PublishedDataCollectionSetup
  publicationVersionId: string
  publicationVersion: number
}

export class DataCollectionDefinitionInvalidError extends Error {
  constructor() {
    super('The pinned Data Collection definition is invalid')
    this.name = 'DataCollectionDefinitionInvalidError'
  }
}

const readPinnedDefinition = (value: JsonValue): PublishedDataCollectionSetup => {
  try {
    return readPublishedDataCollectionSetup(value)
  } catch {
    throw new DataCollectionDefinitionInvalidError()
  }
}

export const lockEligibleRuntimeDataCollectionSetupSnapshot = async (
  db: Transaction<Database>,
  dataCollectionSetupId: string,
  _entityType: Entity_Type,
  ownerAgencyId: string,
  pinnedPublication?: PublishedDataCollectionSetup,
  pinnedPublicationVersionId?: string,
  pinnedPublicationVersion?: number,
  allowHistoricalVersions = false
): Promise<LockedDataCollectionSetup | null> => {
  const setup = await db.selectFrom('Common_Data_Collection_Setup').selectAll()
    .where('id', '=', dataCollectionSetupId).where('egcs_cn_agency', '=', ownerAgencyId)
    .where('_deleted', '=', false).forUpdate().executeTakeFirst()
  if (!setup || (pinnedPublication && !pinnedPublicationVersionId)) return null
  let query = db.selectFrom('Common_Publication')
    .innerJoin('Common_Publication_Version', 'Common_Publication_Version.egcs_cn_publication', 'Common_Publication.id')
    .select(['Common_Publication.egcs_cn_state as state', 'Common_Publication_Version.id as versionId',
      'Common_Publication_Version.egcs_cn_version as version', 'Common_Publication_Version.egcs_cn_definition as definition'])
    .where('Common_Publication.id', '=', dataCollectionSetupId)
    .where('Common_Publication.egcs_cn_kind', '=', 'data_collection_setup').where('Common_Publication._deleted', '=', false)
  query = pinnedPublicationVersionId
    ? query.where('Common_Publication_Version.id', '=', pinnedPublicationVersionId)
    : query.where('Common_Publication.egcs_cn_state', '=', 'published')
        .whereRef('Common_Publication_Version.id', '=', 'Common_Publication.egcs_cn_currentversion')
  const version = await query.executeTakeFirst()
  if (!version || (!allowHistoricalVersions && version.state !== 'published')) return null
  if (pinnedPublicationVersion !== undefined && Number(version.version) !== pinnedPublicationVersion) return null
  const publication = readPinnedDefinition(version.definition)
  if (publication.dataCollectionId !== dataCollectionSetupId || publication.agencyId !== ownerAgencyId) return null
  if (pinnedPublication && JSON.stringify(canonicalizePublicationDefinition(pinnedPublication as JsonValue))
    !== JSON.stringify(canonicalizePublicationDefinition(publication as JsonValue))) return null
  if (publication.approval) {
    const approval = publication.approval
    let approvalQuery = db.selectFrom('Common_Publication_Version')
      .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Publication_Version.egcs_cn_publication')
      .innerJoin('Common_Approval_Template', 'Common_Approval_Template.id', 'Common_Publication.id')
      .innerJoin('Common_Publication_Version_Reference', join => join
        .onRef('Common_Publication_Version_Reference.egcs_cn_publicationversion', '=', 'Common_Publication_Version.id')
        .on('Common_Publication_Version_Reference.egcs_cn_parentversion', '=', String(version.versionId))
        .on('Common_Publication_Version_Reference.egcs_cn_path', '=', 'approval'))
      .select('Common_Publication_Version.id')
      .where('Common_Publication.id', '=', approval.publicationId)
      .where('Common_Publication.egcs_cn_kind', '=', 'approval_template')
      .where('Common_Publication_Version.id', '=', approval.publicationVersionId)
      .where('Common_Publication_Version.egcs_cn_version', '=', approval.publicationVersion)
      .where('Common_Approval_Template.egcs_cn_agency', '=', ownerAgencyId)
      .where('Common_Approval_Template._deleted', '=', false).where('Common_Publication._deleted', '=', false)
    if (!allowHistoricalVersions) approvalQuery = approvalQuery.where('Common_Publication.egcs_cn_state', '=', 'published')
    if (!await approvalQuery.executeTakeFirst()) return null
  }
  return { dataCollectionSetup: setup, publication, publicationVersionId: String(version.versionId), publicationVersion: Number(version.version) }
}

export const fetchRuntimeDataCollection = async (db: DbClient, dataCollectionId: string) => {
  if (!isPositivePostgresBigintText(dataCollectionId)) return null
  const row = await db.selectFrom('Common_Data_Collection')
    .innerJoin('Common_Runtime_Item as Collection_Item', 'Collection_Item.id', 'Common_Data_Collection.egcs_cn_runtimeitem')
    .innerJoin('Common_Runtime', 'Common_Runtime.id', 'Collection_Item.egcs_cn_runtime')
    .innerJoin('Common_Publication_Version as Collection_Version', 'Collection_Version.id', 'Collection_Item.egcs_cn_publicationversion')
    .selectAll('Common_Data_Collection')
    .select(['Common_Runtime.id as runtimeId', 'Common_Runtime.egcs_cn_entitytype as runtimeEntityType',
      'Common_Runtime.egcs_cn_entityid as runtimeEntityId', 'Common_Runtime.egcs_cn_state as rootRuntimeState',
      'Common_Runtime.egcs_cn_attempt as attempt', 'Common_Runtime.egcs_cn_previousruntime as previousRuntimeId',
      'Collection_Item.id as runtimeItemId', 'Collection_Item.egcs_cn_state as runtimeState',
      'Collection_Item.egcs_cn_publication as publicationId', 'Collection_Version.id as publicationVersionId',
      'Collection_Version.egcs_cn_version as publicationVersion', 'Collection_Version.egcs_cn_definition as publicationDefinition'])
    .where('Common_Data_Collection.id', '=', dataCollectionId).where('Common_Data_Collection._deleted', '=', false)
    .where('Collection_Item.egcs_cn_kind', '=', 'data_collection').where('Collection_Item._deleted', '=', false)
    .where('Common_Runtime.egcs_cn_kind', '=', 'workflow').where('Common_Runtime._deleted', '=', false).executeTakeFirst()
  if (!row) return null
  const publication = readPinnedDefinition(row.publicationDefinition)
  const { publicationDefinition: _publicationDefinition, ...runtimeRow } = row
  return {
    ...runtimeRow, id: String(row.id), egcs_cn_datacollectionsetup: String(row.egcs_cn_datacollectionsetup),
    egcs_cn_entityid: String(row.egcs_cn_entityid), egcs_cn_runtimeitem: String(row.egcs_cn_runtimeitem),
    runtimeId: String(row.runtimeId), runtimeItemId: String(row.runtimeItemId),
    attempt: Number(row.attempt), previousRuntimeId: row.previousRuntimeId === null ? null : String(row.previousRuntimeId),
    publicationId: String(row.publicationId), publicationVersionId: String(row.publicationVersionId),
    publicationVersion: Number(row.publicationVersion), definition: publication.definition,
    name_en: publication.nameEn, name_fr: publication.nameFr,
    description_en: publication.descriptionEn, description_fr: publication.descriptionFr,
    agencyId: publication.agencyId,
    workflow_run_id: String(row.runtimeId), workflow_entity_type: row.runtimeEntityType,
    workflow_entity_id: String(row.runtimeEntityId)
  }
}

export const createRuntimeDataCollectionInTransaction = async (input: {
  db: Transaction<Database>
  dataCollectionSetupId: string
  entityType: Entity_Type
  entityId: string
  creatorCommonUserId: string
  defaultOwnerId?: string
  defaultGroupId?: string
  ownerAgencyId: string
  publication?: PublishedDataCollectionSetup
  publicationVersionId?: string
  publicationVersion?: number
  runtimeId: string
  runtimeItemOrder?: number
}) => {
  if (input.defaultOwnerId && input.defaultGroupId) return null
  const snapshot = await lockEligibleRuntimeDataCollectionSetupSnapshot(input.db, input.dataCollectionSetupId,
    input.entityType, input.ownerAgencyId, input.publication, input.publicationVersionId, input.publicationVersion, true)
  if (!snapshot) return null
  const runtime = await input.db.selectFrom('Common_Runtime').selectAll()
    .where('id', '=', input.runtimeId).where('egcs_cn_kind', '=', 'workflow')
    .where('egcs_cn_entitytype', '=', input.entityType).where('egcs_cn_entityid', '=', input.entityId)
    .where('egcs_cn_state', 'not in', [...RUNTIME_TERMINAL_STATES]).where('_deleted', '=', false)
    .forUpdate().executeTakeFirst()
  if (!runtime) return null
  const reference = await input.db.selectFrom('Common_Publication_Version_Reference').select('egcs_cn_parentversion')
    .where('egcs_cn_parentversion', '=', String(runtime.egcs_cn_sourcepublicationversion))
    .where('egcs_cn_publicationversion', '=', snapshot.publicationVersionId).executeTakeFirst()
  if (!reference) return null
  const runtimeOrder = input.runtimeItemOrder ?? Number((await input.db.selectFrom('Common_Runtime_Item')
    .select(eb => eb.fn.max('egcs_cn_order').as('maximum')).where('egcs_cn_runtime', '=', input.runtimeId)
    .where('egcs_cn_parentruntimeitem', 'is', null).executeTakeFirst())?.maximum ?? 0) + 1
  const runtimeItemId = await createRuntimeItem(input.db, {
    egcs_cn_runtime: input.runtimeId, egcs_cn_parentruntimeitem: null, egcs_cn_kind: 'data_collection',
    egcs_cn_order: runtimeOrder, egcs_cn_publication: input.dataCollectionSetupId,
    egcs_cn_publicationkind: 'data_collection_setup', egcs_cn_publicationversion: snapshot.publicationVersionId,
    egcs_cn_version: snapshot.publicationVersion
  })
  const created = await input.db.insertInto('Common_Data_Collection').values({
    egcs_cn_datacollectionsetup: input.dataCollectionSetupId, egcs_cn_entitytype: input.entityType,
    egcs_cn_entityid: input.entityId, egcs_cn_runtimeitem: runtimeItemId,
    egcs_cn_response: { responses: [] }, egcs_cn_group: input.defaultGroupId ?? null, _deleted: false
  }).returning('id').executeTakeFirstOrThrow()
  if (!input.defaultGroupId) await createPrimaryEntityAssignment(input.db, 'commondatacollection',
    String(created.id), input.defaultOwnerId ?? input.creatorCommonUserId)
  await transitionRuntimeItem(input.db, { runtimeId: input.runtimeId, runtimeItemId,
    from: 'pending', to: 'active', actorId: input.creatorCommonUserId, reason: 'data_collection_materialized' })
  return await fetchRuntimeDataCollection(input.db, String(created.id))
}

export const advanceDataCollectionRuntimeAfterTerminalItem = async (
  db: Transaction<Database>, dataCollectionId: string, actorId?: string
) => {
  const row = await db.selectFrom('Common_Data_Collection')
    .innerJoin('Common_Runtime_Item', 'Common_Runtime_Item.id', 'Common_Data_Collection.egcs_cn_runtimeitem')
    .innerJoin('Common_Runtime', 'Common_Runtime.id', 'Common_Runtime_Item.egcs_cn_runtime')
    .select(['Common_Runtime.id as runtimeId', 'Common_Runtime_Item.id as runtimeItemId', 'Common_Runtime_Item.egcs_cn_state as state'])
    .where('Common_Data_Collection.id', '=', dataCollectionId).where('Common_Data_Collection._deleted', '=', false)
    .where('Common_Runtime_Item._deleted', '=', false).where('Common_Runtime._deleted', '=', false)
    .where('Common_Runtime.egcs_cn_kind', '=', 'workflow').forUpdate(['Common_Runtime', 'Common_Runtime_Item']).executeTakeFirst()
  if (!row || !RUNTIME_TERMINAL_STATES.has(row.state)) return null
  const { advanceWorkflowAfterDataCollection } = await import('./workflow-runtime')
  await advanceWorkflowAfterDataCollection(db, String(row.runtimeItemId), actorId)
  return { runtimeId: String(row.runtimeId), dataCollectionRuntimeItemId: String(row.runtimeItemId), state: row.state }
}

export const saveDataCollectionById = async (
  event: H3Event,
  dataCollectionId: string,
  responses: QuestionnaireResponse[],
  submit: boolean,
  userId: string,
  trx: Transaction<Database>,
  expectedRevision: number
) => {
  return await saveQuestionnaireRuntimeInTransaction(event, trx, {
    responses, submit, expectedRevision,
    adapter: {
      missing: { code: 'DATA_COLLECTION_NOT_FOUND', key: 'apiErrors.admin_common.not_found' },
      conflict: { code: 'DATA_COLLECTION_REVISION_CONFLICT', key: 'apiErrors.data_collection.revision_conflict' },
      load: async db => {
        const row = await db.selectFrom('Common_Data_Collection')
          .innerJoin('Common_Runtime_Item as Collection_Item', 'Collection_Item.id', 'Common_Data_Collection.egcs_cn_runtimeitem')
          .innerJoin('Common_Runtime', 'Common_Runtime.id', 'Collection_Item.egcs_cn_runtime')
          .innerJoin('Common_Publication_Version as Collection_Version', 'Collection_Version.id', 'Collection_Item.egcs_cn_publicationversion')
          .selectAll('Common_Data_Collection')
          .select(['Collection_Item.id as runtimeItemId', 'Collection_Item.egcs_cn_runtime as runtimeId',
            'Collection_Item.egcs_cn_state as runtimeState', 'Common_Runtime.egcs_cn_state as rootRuntimeState',
            'Collection_Version.egcs_cn_definition as publicationDefinition'])
          .where('Common_Data_Collection.id', '=', dataCollectionId).where('Common_Data_Collection._deleted', '=', false)
          .where('Collection_Item._deleted', '=', false).where('Common_Runtime._deleted', '=', false)
          .forUpdate(['Common_Data_Collection', 'Collection_Item', 'Common_Runtime']).executeTakeFirst()
        if (!row) return null
        let publication
        try {
          publication = readPinnedDefinition(row.publicationDefinition)
        } catch (error) {
          if (!(error instanceof DataCollectionDefinitionInvalidError)) throw error
          return await throwApiError(event, { statusCode: 409, code: 'DATA_COLLECTION_DEFINITION_INVALID', key: 'apiErrors.data_collection.definition_invalid' })
        }
        return { ...row, publication, revision: Number(row.egcs_cn_revision),
          state: row.rootRuntimeState === 'active' ? row.runtimeState : row.rootRuntimeState }
      },
      validate: (record, suppliedResponses, isSubmit) => {
        const definition = DataCollectionDefinitionSchema.parse(record.publication.definition)
        const issues = validateQuestionnaireResponses(definition, suppliedResponses, { mode: isSubmit ? 'submit' : 'draft' })
        return issues.length > 0 ? { code: 'DATA_COLLECTION_RESPONSE_INVALID', key: 'apiErrors.data_collection.response_invalid' } : null
      },
      persist: async (db, _record, suppliedResponses, nextRevision) => {
        await db.updateTable('Common_Data_Collection')
          .set({ egcs_cn_response: { responses: suppliedResponses }, egcs_cn_revision: nextRevision })
          .where('id', '=', dataCollectionId).execute()
        const updated = await fetchRuntimeDataCollection(db, dataCollectionId)
        if (!updated) return await notFound(event, 'DATA_COLLECTION_NOT_FOUND', 'apiErrors.admin_common.not_found')
        return updated
      },
      submit: async (db, record, updated) => {
        const approval = record.publication.approval
        if (approval) {
          await materializeCanonicalApprovalRuntime(db, {
            entityType: 'commondatacollection', entityId: dataCollectionId,
            nameEn: record.publication.nameEn, nameFr: record.publication.nameFr,
            approvalTemplateId: approval.publicationId, approvalTemplateVersionId: approval.publicationVersionId,
            parentRuntimeItemId: String(record.runtimeItemId), actorId: userId
          })
        } else {
          await transitionRuntimeItem(db, { runtimeId: String(record.runtimeId), runtimeItemId: String(record.runtimeItemId),
            from: 'active', to: 'succeeded', actorId: userId, reason: 'data_collection_submitted' })
          await advanceDataCollectionRuntimeAfterTerminalItem(db, dataCollectionId, userId)
        }
        return await fetchRuntimeDataCollection(db, dataCollectionId) ?? updated
      }
    }
  })
}
