/* eslint-disable jsdoc/require-jsdoc -- Typed read-only workflow evidence projection. */
import type { Kysely } from 'kysely'
import { z } from 'zod'
import type { Database, Entity_Type, JsonValue } from '~~/shared/types/database'
import { QuestionnaireResponseEnvelopeSchema } from '~~/shared/types/schemas/questionnaire'
import type {
  WorkflowSupplementaryInformationResponse,
  WorkflowSupplementaryInformationWorkflow
} from '~~/shared/types/workflow-supplementary-information'
import { readPublishedDataCollectionSetup } from './data-collection-setup-versioning'

const PinnedWorkflowHeaderSchema = z.object({ nameEn: z.string(), nameFr: z.string() })
// Approval-backed workflows and collections finish as approved; other positive
// terminal outcomes finish as succeeded (system-runtime/workflow-runtime).
const SUCCESSFUL_WORKFLOW_RUNTIME_STATES = ['succeeded', 'approved'] as const

export class WorkflowSupplementaryInformationInvalidError extends Error {
  constructor() {
    super('The retained supplementary workflow information is invalid')
    this.name = 'WorkflowSupplementaryInformationInvalidError'
  }
}

const readPinnedEvidence = <T>(read: () => T): T => {
  try {
    return read()
  } catch {
    throw new WorkflowSupplementaryInformationInvalidError()
  }
}

export const getWorkflowSupplementaryInformation = async (
  db: Kysely<Database>,
  entityType: Entity_Type,
  entityId: string
): Promise<WorkflowSupplementaryInformationResponse> => {
  // Select the latest complete success before joining collections. A newer route with
  // no collection must never reveal an older route's answers for the same setup.
  const rows = await db.with('Latest_Successful_Workflow', qb => qb.selectFrom('Common_Runtime')
    .select(['id', 'egcs_cn_sourcepublication', 'egcs_cn_sourcepublicationversion', 'egcs_cn_sourceversion',
      'egcs_cn_purpose', 'egcs_cn_completedat'])
    .distinctOn('egcs_cn_sourcepublication')
    .where('egcs_cn_kind', '=', 'workflow')
    .where('egcs_cn_entitytype', '=', entityType)
    .where('egcs_cn_entityid', '=', entityId)
    .where('egcs_cn_state', 'in', SUCCESSFUL_WORKFLOW_RUNTIME_STATES)
    .where('_deleted', '=', false)
    .orderBy('egcs_cn_sourcepublication', 'asc')
    .orderBy('egcs_cn_completedat', order => order.desc().nullsLast())
    .orderBy('id', 'desc'))
    .with('Successful_Collection', qb => qb.selectFrom('Common_Data_Collection as Collection')
      .innerJoin('Common_Runtime_Item as Collection_Item', 'Collection_Item.id', 'Collection.egcs_cn_runtimeitem')
      .select(['Collection.id as collectionId', 'Collection.egcs_cn_datacollectionsetup', 'Collection.egcs_cn_response',
        'Collection_Item.egcs_cn_runtime as runtimeId', 'Collection_Item.egcs_cn_order as memberSequence',
        'Collection_Item.egcs_cn_publication as publicationId', 'Collection_Item.egcs_cn_publicationversion as collectionVersionId',
        'Collection_Item.egcs_cn_version as collectionVersion'])
      .where('Collection_Item.egcs_cn_kind', '=', 'data_collection')
      .where('Collection_Item.egcs_cn_parentruntimeitem', 'is', null)
      .where('Collection_Item.egcs_cn_state', 'in', SUCCESSFUL_WORKFLOW_RUNTIME_STATES)
      .where('Collection_Item._deleted', '=', false)
      .where('Collection.egcs_cn_entitytype', '=', entityType)
      .where('Collection.egcs_cn_entityid', '=', entityId)
      .where('Collection._deleted', '=', false))
    .selectFrom('Latest_Successful_Workflow')
    .leftJoin('Common_Publication_Version as Workflow_Version', join => join
      .onRef('Workflow_Version.id', '=', 'Latest_Successful_Workflow.egcs_cn_sourcepublicationversion')
      .onRef('Workflow_Version.egcs_cn_publication', '=', 'Latest_Successful_Workflow.egcs_cn_sourcepublication')
      .onRef('Workflow_Version.egcs_cn_version', '=', 'Latest_Successful_Workflow.egcs_cn_sourceversion')
      .on('Workflow_Version.egcs_cn_kind', '=', 'workflow_setup'))
    .leftJoin('Successful_Collection', 'Successful_Collection.runtimeId', 'Latest_Successful_Workflow.id')
    .leftJoin('Common_Publication_Version as Collection_Version', join => join
      .onRef('Collection_Version.id', '=', 'Successful_Collection.collectionVersionId')
      .onRef('Collection_Version.egcs_cn_publication', '=', 'Successful_Collection.publicationId')
      .onRef('Collection_Version.egcs_cn_version', '=', 'Successful_Collection.collectionVersion')
      .on('Collection_Version.egcs_cn_kind', '=', 'data_collection_setup'))
    .selectAll('Latest_Successful_Workflow')
    .selectAll('Successful_Collection')
    .select(['Workflow_Version.egcs_cn_definition as workflowDefinition',
      'Collection_Version.egcs_cn_definition as collectionDefinition'])
    .orderBy('Latest_Successful_Workflow.egcs_cn_completedat', order => order.desc().nullsLast())
    .orderBy('Latest_Successful_Workflow.id', 'desc')
    .orderBy('Successful_Collection.memberSequence', 'asc')
    .orderBy('Successful_Collection.collectionId', 'asc')
    .execute()
  const workflowByRuntimeId = new Map<string, WorkflowSupplementaryInformationWorkflow>()
  for (const row of rows) {
    const runtimeId = String(row.id)
    if (!workflowByRuntimeId.has(runtimeId)) {
      const header = readPinnedEvidence(() => PinnedWorkflowHeaderSchema.parse(row.workflowDefinition))
      if (!row.egcs_cn_completedat) throw new WorkflowSupplementaryInformationInvalidError()
      workflowByRuntimeId.set(runtimeId, {
        runtimeId,
        workflowSetupId: String(row.egcs_cn_sourcepublication),
        purpose: row.egcs_cn_purpose,
        name_en: header.nameEn,
        name_fr: header.nameFr,
        completedAt: row.egcs_cn_completedat.toISOString(),
        collections: []
      })
    }
    if (row.collectionId === null) continue
    const publication = readPinnedEvidence(() => readPublishedDataCollectionSetup(row.collectionDefinition as JsonValue))
    if (publication.dataCollectionId !== String(row.egcs_cn_datacollectionsetup)
      || publication.dataCollectionId !== String(row.publicationId)) {
      throw new WorkflowSupplementaryInformationInvalidError()
    }
    const responses = readPinnedEvidence(() => QuestionnaireResponseEnvelopeSchema.parse(row.egcs_cn_response)).responses
    workflowByRuntimeId.get(runtimeId)!.collections.push({
      id: String(row.collectionId),
      memberSequence: row.memberSequence!,
      name_en: publication.nameEn,
      name_fr: publication.nameFr,
      description_en: publication.descriptionEn,
      description_fr: publication.descriptionFr,
      definition: publication.definition,
      responses
    })
  }
  // Omit approval-only and other empty winners after selecting and validating the
  // latest success, so hiding them cannot bring back an older run's answers.
  return { workflows: [...workflowByRuntimeId.values()].filter(workflow => workflow.collections.length > 0) }
}
