import { authorize } from '~~/server/utils/authorize'
import { authorizeAgencyWorkflowCatalog } from '~~/server/utils/agency-workflow-authorization'
import { PaginationSchema } from '~~/shared/types/schemas'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { readPublicationMetadataBatch } from '~~/server/utils/system-publication'
import { z } from 'zod'

const AgencyWorkflowListQuerySchema = PaginationSchema.extend({
  publicationState: z.enum(['draft', 'published', 'retired']).optional()
})

export default defineEventHandler(async event => {
  const db = event.context.$db
  const agencyId = getRouterParam(event, 'agencyId')
  if (!agencyId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  await authorizeAgencyWorkflowCatalog(event, 'read', agencyId)
  await authorize(event, 'agency', 'read', { type: 'agency', agencyId })
  const { page, limit, search, publicationState } = await getValidatedQueryI18n(event, AgencyWorkflowListQuerySchema)
  const offset = (page - 1) * limit
  let baseQuery = db.selectFrom('Common_Workflow_Setup')
    .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Workflow_Setup.id')
    .innerJoin('Common_Entity_Type', 'Common_Entity_Type.egcs_cn_type', 'Common_Workflow_Setup.egcs_cn_entitytype')
    .where('Common_Workflow_Setup.egcs_cn_agency', '=', agencyId).where('Common_Workflow_Setup._deleted', '=', false)
    .where('Common_Publication._deleted', '=', false)
  if (publicationState) baseQuery = baseQuery.where('Common_Publication.egcs_cn_state', '=', publicationState)
  if (search) {
    const value = escapeLikePattern(search)
    baseQuery = baseQuery.where(eb => eb.or([
      eb('Common_Workflow_Setup.egcs_cn_name_en', 'ilike', `%${value}%`), eb('Common_Workflow_Setup.egcs_cn_name_fr', 'ilike', `%${value}%`),
      eb('Common_Workflow_Setup.egcs_cn_description_en', 'ilike', `%${value}%`), eb('Common_Workflow_Setup.egcs_cn_description_fr', 'ilike', `%${value}%`)
    ]))
  }
  const [items, count] = await Promise.all([
    baseQuery.selectAll('Common_Workflow_Setup').select([
      'Common_Entity_Type.egcs_cn_label_en as entityTypeLabelEn',
      'Common_Entity_Type.egcs_cn_label_fr as entityTypeLabelFr'
    ]).orderBy('Common_Workflow_Setup.id', 'asc').limit(limit).offset(offset).execute(),
    baseQuery.select(eb => [
      eb.fn.count('Common_Workflow_Setup.id').as('total'),
      eb.fn.count('Common_Workflow_Setup.id').filterWhere('Common_Publication.egcs_cn_state', '=', 'published').as('published')
    ]).executeTakeFirst()
  ])
  const setupIds = items.map(item => String(item.id))
  const allowedRows = setupIds.length === 0
    ? []
    : await db.selectFrom('Common_Workflow_Setup_Allowed_Start_Status')
        .innerJoin('Common_Workflow_Setup', 'Common_Workflow_Setup.id', 'Common_Workflow_Setup_Allowed_Start_Status.egcs_cn_workflowsetup')
        .select(['egcs_cn_workflowsetup', 'egcs_cn_status', 'egcs_cn_order'])
        .where('Common_Workflow_Setup_Allowed_Start_Status.egcs_cn_workflowsetup', 'in', setupIds)
        .where('Common_Workflow_Setup.egcs_cn_agency', '=', agencyId)
        .where('Common_Workflow_Setup_Allowed_Start_Status._deleted', '=', false)
        .where('Common_Workflow_Setup._deleted', '=', false)
        .orderBy('egcs_cn_order', 'asc').execute()
  // Building every nested working definition here recursively loads members, owners,
  // referenced publications, and statuses once per row. Collection reads instead use
  // one lifecycle batch and conservatively flag every non-retired setup as editable;
  // exact working-definition comparison remains available on the detail route.
  const publicationMetadata = await readPublicationMetadataBatch(db, items.map(item => ({
    publicationId: String(item.id)
  })))
  const total = Number(count?.total ?? 0)
  return {
    items: items.map((item) => {
      const metadata = publicationMetadata.get(String(item.id))!
      return {
        ...item,
        egcs_cn_agency: String(item.egcs_cn_agency),
        ...metadata,
        hasUnpublishedChanges: metadata.publicationState !== 'retired',
        egcs_cn_allowedstartstatuses: allowedRows
          .filter(row => String(row.egcs_cn_workflowsetup) === String(item.id))
          .map(row => String(row.egcs_cn_status))
      }
    }),
    total,
    stats: { total, published: Number(count?.published ?? 0) },
    page,
    limit
  }
})
