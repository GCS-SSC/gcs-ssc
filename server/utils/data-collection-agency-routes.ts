/* eslint-disable jsdoc/require-jsdoc -- Agency Data Collection route implementations. */
import type { H3Event } from 'h3'
import { getRouterParam } from 'h3'
import { DataCollectionListQuerySchema, DataCollectionSetupCreateSchema, DataCollectionSetupPatchSchema } from '~~/shared/types/schemas/data-collection'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { authorize, requireAuthContext } from './authorize'
import { withActiveAgencyMutationTransaction, withActiveAgencyReadTransaction } from './agency-auth'
import { badRequest, notFound, throwApiError } from './api-errors'
import { getValidatedQueryI18n, readValidatedBodyI18n } from './api-validate'
import { resolvePublicationActorId } from './recommendation-setup-versioning'
import {
  buildDataCollectionSetupPublication,
  DataCollectionPublicationMissingError,
  lockDataCollectionSetupForMutation,
  readDataCollectionSetupPublicationMetadata
} from './data-collection-setup-versioning'
import { escapeLikePattern } from './sql-like'
import { publishDefinition, retirePublication } from './system-publication'

const routeIds = async (event: H3Event, detail = false) => {
  await requireAuthContext(event)
  const agencyId = getRouterParam(event, 'agencyId') ?? ''
  const dataCollectionId = getRouterParam(event, 'dataCollectionId') ?? ''
  if (!isPositivePostgresBigintText(agencyId)) await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found')
  if (detail && !isPositivePostgresBigintText(dataCollectionId)) await notFound(event, 'DATA_COLLECTION_SETUP_NOT_FOUND', 'apiErrors.admin_common.not_found')
  return { agencyId, dataCollectionId }
}

const lockSetup = async (event: H3Event, db: H3Event['context']['$db'], agencyId: string, dataCollectionId: string) => {
  const setup = await lockDataCollectionSetupForMutation(db, dataCollectionId, agencyId)
  if (!setup) return await notFound(event, 'DATA_COLLECTION_SETUP_NOT_FOUND', 'apiErrors.admin_common.not_found')
  return setup
}

const validateApproval = async (
  event: H3Event,
  db: H3Event['context']['$db'],
  agencyId: string,
  templateId?: string | null
) => {
  if (!templateId) return
  const template = await db.selectFrom('Common_Approval_Template')
    .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Approval_Template.id')
    .select('Common_Approval_Template.id')
    .where('Common_Approval_Template.id', '=', templateId)
    .where('Common_Approval_Template.egcs_cn_agency', '=', agencyId)
    .where('Common_Approval_Template._deleted', '=', false)
    .where('Common_Publication._deleted', '=', false)
    .where('Common_Publication.egcs_cn_state', '=', 'published')
    .forShare(['Common_Approval_Template', 'Common_Publication'])
    .executeTakeFirst()
  if (!template) await badRequest(event, 'APPROVAL_TEMPLATE_NOT_FOUND', 'apiErrors.transfer_payment.approval_template_not_found')
}

export const listAgencyDataCollections = async (event: H3Event) => {
  const { agencyId } = await routeIds(event)
  await authorize(event, 'agency', 'read', { type: 'agency', agencyId })
  const { page, limit, search, state } = await getValidatedQueryI18n(event, DataCollectionListQuerySchema)
  return await withActiveAgencyReadTransaction(event, agencyId, async trx => {
    let query = trx.selectFrom('Common_Data_Collection_Setup')
      .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Data_Collection_Setup.id')
      .where('Common_Data_Collection_Setup.egcs_cn_agency', '=', agencyId)
      .where('Common_Data_Collection_Setup._deleted', '=', false)
      .where('Common_Publication._deleted', '=', false)
    if (state) query = query.where('Common_Publication.egcs_cn_state', '=', state)
    if (search) {
      const pattern = `%${escapeLikePattern(search)}%`
      query = query.where(eb => eb.or([
        eb('Common_Data_Collection_Setup.egcs_cn_name_en', 'ilike', pattern),
        eb('Common_Data_Collection_Setup.egcs_cn_name_fr', 'ilike', pattern),
        eb('Common_Data_Collection_Setup.egcs_cn_description_en', 'ilike', pattern),
        eb('Common_Data_Collection_Setup.egcs_cn_description_fr', 'ilike', pattern)
      ]))
    }
    const [setups, count] = await Promise.all([
      query.selectAll('Common_Data_Collection_Setup').orderBy('Common_Data_Collection_Setup.id', 'asc')
        .limit(limit).offset((page - 1) * limit).execute(),
      query.select(eb => [eb.fn.count('Common_Data_Collection_Setup.id').as('total'),
        eb.fn.count('Common_Data_Collection_Setup.id').filterWhere('Common_Publication.egcs_cn_state', '=', 'published').as('published')])
        .executeTakeFirst()
    ])
    const total = Number(count?.total ?? 0)
    return {
      items: await Promise.all(setups.map(async setup => ({ ...setup,
        id: String(setup.id), egcs_cn_agency: String(setup.egcs_cn_agency),
        ...await readDataCollectionSetupPublicationMetadata(trx, setup) }))),
      total, stats: { total, published: Number(count?.published ?? 0) }, page, limit
    }
  })
}

export const createAgencyDataCollection = async (event: H3Event) => {
  const { agencyId } = await routeIds(event)
  await authorize(event, 'agency', 'update', { type: 'agency', agencyId })
  const body = await readValidatedBodyI18n(event, DataCollectionSetupCreateSchema)
  return await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
    await validateApproval(event, trx, agencyId, body.egcs_cn_approvaltemplate)
    const created = await trx.insertInto('Common_Data_Collection_Setup')
      .values({ ...body, egcs_cn_agency: agencyId, _deleted: false })
      .returningAll().executeTakeFirstOrThrow()
    return { ...created, id: String(created.id), egcs_cn_agency: String(created.egcs_cn_agency),
      ...await readDataCollectionSetupPublicationMetadata(trx, created) }
  })
}

export const getAgencyDataCollection = async (event: H3Event) => {
  const { agencyId, dataCollectionId } = await routeIds(event, true)
  await authorize(event, 'agency', 'read', { type: 'agency', agencyId })
  return await withActiveAgencyReadTransaction(event, agencyId, async trx => {
    const setup = await trx.selectFrom('Common_Data_Collection_Setup').selectAll()
      .where('id', '=', dataCollectionId).where('egcs_cn_agency', '=', agencyId)
      .where('_deleted', '=', false).executeTakeFirst()
    if (!setup) return await notFound(event, 'DATA_COLLECTION_SETUP_NOT_FOUND', 'apiErrors.admin_common.not_found')
    return { ...setup, id: String(setup.id), egcs_cn_agency: String(setup.egcs_cn_agency),
      ...await readDataCollectionSetupPublicationMetadata(trx, setup) }
  })
}

export const patchAgencyDataCollection = async (event: H3Event) => {
  const { agencyId, dataCollectionId } = await routeIds(event, true)
  await authorize(event, 'agency', 'update', { type: 'agency', agencyId })
  const body = await readValidatedBodyI18n(event, DataCollectionSetupPatchSchema)
  if (Object.keys(body).length === 0) return await badRequest(event, 'EMPTY_UPDATE', 'apiErrors.request.invalid_resource')
  return await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
    const current = await lockSetup(event, trx, agencyId, dataCollectionId)
    if (current.publicationState === 'retired') return await throwApiError(event, { statusCode: 409, code: 'PUBLICATION_RETIRED', key: 'apiErrors.request.invalid_status' })
    await validateApproval(event, trx, agencyId, body.egcs_cn_approvaltemplate)
    const updated = await trx.updateTable('Common_Data_Collection_Setup').set(body)
      .where('id', '=', dataCollectionId).where('egcs_cn_agency', '=', agencyId).where('_deleted', '=', false)
      .returningAll().executeTakeFirstOrThrow()
    return { ...updated, id: String(updated.id), egcs_cn_agency: String(updated.egcs_cn_agency),
      ...await readDataCollectionSetupPublicationMetadata(trx, updated) }
  })
}

export const deleteAgencyDataCollection = async (event: H3Event) => {
  const { agencyId, dataCollectionId } = await routeIds(event, true)
  await authorize(event, 'agency', 'update', { type: 'agency', agencyId })
  return await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
    const setup = await lockSetup(event, trx, agencyId, dataCollectionId)
    if (setup.publicationState !== 'draft') return await badRequest(event, 'DATA_COLLECTION_SETUP_NOT_DRAFT', 'apiErrors.request.invalid_status')
    const member = await trx.selectFrom('Common_Workflow_Setup_Member').select('id')
      .where('egcs_cn_datacollection', '=', dataCollectionId).where('_deleted', '=', false).executeTakeFirst()
    if (member) return await badRequest(event, 'DATA_COLLECTION_SETUP_REFERENCED', 'apiErrors.request.invalid_resource')
    await trx.updateTable('Common_Data_Collection_Setup').set({ _deleted: true }).where('id', '=', dataCollectionId).execute()
    await trx.updateTable('Common_Publication').set({ _deleted: true }).where('id', '=', dataCollectionId)
      .where('egcs_cn_state', '=', 'draft').execute()
    return { success: true }
  })
}

export const publishAgencyDataCollection = async (event: H3Event) => {
  const { agencyId, dataCollectionId } = await routeIds(event, true)
  const auth = await requireAuthContext(event)
  await authorize(event, 'agency', 'update', { type: 'agency', agencyId })
  return await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
    const setup = await lockSetup(event, trx, agencyId, dataCollectionId)
    await validateApproval(event, trx, agencyId, setup.egcs_cn_approvaltemplate)
    const actorId = await resolvePublicationActorId(trx, auth.userId)
    if (!actorId) return await notFound(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')
    let plan
    try {
      plan = await buildDataCollectionSetupPublication(trx, setup)
    } catch (error) {
      if (!(error instanceof DataCollectionPublicationMissingError)) throw error
      return await badRequest(event, 'DATA_COLLECTION_SETUP_INVALID_PUBLICATION', 'apiErrors.request.invalid_resource')
    }
    const publication = await publishDefinition(trx, { publicationId: dataCollectionId, kind: 'data_collection_setup',
      definition: plan.definition, actorId, references: plan.references })
    const { definition: _definition, hash: _hash, ...metadata } = publication
    return { ...setup, id: String(setup.id), egcs_cn_agency: String(setup.egcs_cn_agency), ...metadata }
  })
}

export const retireAgencyDataCollection = async (event: H3Event) => {
  const { agencyId, dataCollectionId } = await routeIds(event, true)
  const auth = await requireAuthContext(event)
  await authorize(event, 'agency', 'update', { type: 'agency', agencyId })
  return await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
    await lockSetup(event, trx, agencyId, dataCollectionId)
    const actorId = await resolvePublicationActorId(trx, auth.userId)
    if (!actorId) return await notFound(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')
    return await retirePublication(trx, { publicationId: dataCollectionId, kind: 'data_collection_setup', actorId })
  })
}
