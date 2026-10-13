import { authorize } from '~~/server/utils/authorize'
import { authorizeAgencyWorkflowSetup } from '~~/server/utils/agency-workflow-authorization'
import { readWorkflowConditions } from '~~/server/utils/workflow-conditions'
import { readWorkflowSetupPublicationMetadata } from '~~/server/utils/workflow-setup-versioning'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { sql } from 'kysely'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const agencyId = getRouterParam(event, 'agencyId')
  const workflowSetupId = getRouterParam(event, 'workflowId')
  if (!agencyId || !workflowSetupId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  if (!isPositivePostgresBigintText(workflowSetupId)) return await notFound(event, 'WORKFLOW_SETUP_NOT_FOUND', 'apiErrors.request.not_found')
  await authorizeAgencyWorkflowSetup(event, 'read', agencyId, workflowSetupId)
  await authorize(event, 'agency', 'read', { type: 'agency', agencyId })
  const setup = await db.selectFrom('Common_Workflow_Setup')
    .innerJoin('Common_Entity_Type', 'Common_Entity_Type.egcs_cn_type', 'Common_Workflow_Setup.egcs_cn_entitytype')
    .selectAll('Common_Workflow_Setup')
    .select([
      'Common_Entity_Type.egcs_cn_label_en as entityTypeLabelEn',
      'Common_Entity_Type.egcs_cn_label_fr as entityTypeLabelFr'
    ])
    .where('Common_Workflow_Setup.id', '=', workflowSetupId)

    .where('Common_Workflow_Setup.egcs_cn_agency', '=', agencyId)
    .where('Common_Workflow_Setup._deleted', '=', false)
    .executeTakeFirst()
  if (!setup) return await notFound(event, 'WORKFLOW_SETUP_NOT_FOUND', 'apiErrors.request.not_found')
  const allowedStartStatuses = await db.selectFrom('Common_Workflow_Setup_Allowed_Start_Status')
    .select('egcs_cn_status').where('egcs_cn_workflowsetup', '=', workflowSetupId)
    .where('_deleted', '=', false).orderBy('egcs_cn_order', 'asc').execute()
  const members = await db.selectFrom('Common_Workflow_Setup_Member')
    .leftJoin('Common_Review_Set_Setup as reviewSet', join => join
      .onRef('reviewSet.id', '=', 'Common_Workflow_Setup_Member.egcs_cn_reviewset')
      .on('reviewSet.egcs_cn_agency', '=', agencyId).on('reviewSet._deleted', '=', false))
    .leftJoin('Common_Recommendation_Set_Setup as recommendationSet', join => join
      .onRef('recommendationSet.id', '=', 'Common_Workflow_Setup_Member.egcs_cn_recommendationset')
      .on('recommendationSet.egcs_cn_agency', '=', agencyId).on('recommendationSet._deleted', '=', false))
    .leftJoin('Common_Data_Collection_Setup as dataCollection', join => join
      .onRef('dataCollection.id', '=', 'Common_Workflow_Setup_Member.egcs_cn_datacollection')
      .on('dataCollection.egcs_cn_agency', '=', agencyId).on('dataCollection._deleted', '=', false))
    .leftJoin('Common_Approval_Template as approvalTemplate', join => join
      .onRef('approvalTemplate.id', '=', 'Common_Workflow_Setup_Member.egcs_cn_approvaltemplate')
      .on('approvalTemplate.egcs_cn_agency', '=', agencyId).on('approvalTemplate._deleted', '=', false))
    .selectAll('Common_Workflow_Setup_Member')
    .select([
      sql<string | null>`coalesce(${sql.ref('reviewSet.egcs_cn_name_en')}, ${sql.ref('recommendationSet.egcs_cn_name_en')}, ${sql.ref('dataCollection.egcs_cn_name_en')}, ${sql.ref('approvalTemplate.egcs_cn_name_en')})`.as('referenceNameEn'),
      sql<string | null>`coalesce(${sql.ref('reviewSet.egcs_cn_name_fr')}, ${sql.ref('recommendationSet.egcs_cn_name_fr')}, ${sql.ref('dataCollection.egcs_cn_name_fr')}, ${sql.ref('approvalTemplate.egcs_cn_name_fr')})`.as('referenceNameFr')
    ])
    .where('Common_Workflow_Setup_Member.egcs_cn_workflowsetup', '=', workflowSetupId)
    .where('Common_Workflow_Setup_Member._deleted', '=', false)
    .orderBy('Common_Workflow_Setup_Member.egcs_cn_sequence', 'asc').execute()
  const owners = members.length === 0
    ? []
    : await db.selectFrom('Common_Workflow_Setup_Member_Owner').selectAll()
        .where('egcs_cn_workflowsetupmember', 'in', members.map(member => String(member.id)))
        .where('_deleted', '=', false).orderBy('id', 'asc').execute()
  return { ...setup, egcs_cn_agency: String(setup.egcs_cn_agency), ...await readWorkflowSetupPublicationMetadata(db, setup), egcs_cn_allowedstartstatuses: allowedStartStatuses.map(row => String(row.egcs_cn_status)), members: await Promise.all(members.map(async member => ({
    conditions: await readWorkflowConditions(db, String(member.id)),
    ...member,
    owners: owners.filter(owner => String(owner.egcs_cn_workflowsetupmember) === String(member.id))
  }))) }
})
