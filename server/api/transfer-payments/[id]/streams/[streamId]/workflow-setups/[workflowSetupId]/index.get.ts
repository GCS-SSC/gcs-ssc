import { readWorkflowConditions } from '~~/server/utils/workflow-conditions'
import { authorize } from '~~/server/utils/authorize'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { readWorkflowSetupPublicationMetadata } from '~~/server/utils/workflow-setup-versioning'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  const workflowSetupId = getRouterParam(event, 'workflowSetupId')
  if (!profileId || !streamId || !workflowSetupId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  if (!isPositivePostgresBigintText(workflowSetupId)) return await notFound(event, 'WORKFLOW_SETUP_NOT_FOUND', 'apiErrors.request.not_found')
  const streamContext = await authorizeTransferPaymentStreamResource(event, 'read', profileId, streamId)
  if (!streamContext) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  await authorize(event, 'transfer_payment', 'read', createTransferPaymentScopedAuthorizeHandler('read', streamContext.scope, db))
  const setup = await db.selectFrom('Common_Workflow_Setup')
    .innerJoin('Common_Entity_Type', 'Common_Entity_Type.egcs_cn_type', 'Common_Workflow_Setup.egcs_cn_entitytype')
    .selectAll('Common_Workflow_Setup')
    .select([
      'Common_Entity_Type.egcs_cn_label_en as entityTypeLabelEn',
      'Common_Entity_Type.egcs_cn_label_fr as entityTypeLabelFr'
    ])
    .where('Common_Workflow_Setup.id', '=', workflowSetupId)
    .where('Common_Workflow_Setup.egcs_cn_scopetype', '=', 'transferpaymentstream')
    .where('Common_Workflow_Setup.egcs_cn_scopeid', '=', streamId)
    .where('Common_Workflow_Setup._deleted', '=', false)
    .executeTakeFirst()
  if (!setup) return await notFound(event, 'WORKFLOW_SETUP_NOT_FOUND', 'apiErrors.request.not_found')
  const allowedStartStatuses = await db.selectFrom('Common_Workflow_Setup_Allowed_Start_Status')
    .select('egcs_cn_status').where('egcs_cn_workflowsetup', '=', workflowSetupId)
    .where('_deleted', '=', false).orderBy('egcs_cn_order', 'asc').execute()
  const members = await db.selectFrom('Common_Workflow_Setup_Member').selectAll()
    .where('egcs_cn_workflowsetup', '=', workflowSetupId).where('_deleted', '=', false)
    .orderBy('egcs_cn_sequence', 'asc').execute()
  const owners = members.length === 0
    ? []
    : await db.selectFrom('Common_Workflow_Setup_Member_Owner').selectAll()
        .where('egcs_cn_workflowsetupmember', 'in', members.map(member => String(member.id)))
        .where('_deleted', '=', false).orderBy('id', 'asc').execute()
  return { ...setup, egcs_cn_scopeid: String(setup.egcs_cn_scopeid), ...await readWorkflowSetupPublicationMetadata(db, setup), egcs_cn_allowedstartstatuses: allowedStartStatuses.map(row => String(row.egcs_cn_status)), members: await Promise.all(members.map(async member => ({
    conditions: await readWorkflowConditions(db, String(member.id)),
    ...member,
    owners: owners.filter(owner => String(owner.egcs_cn_workflowsetupmember) === String(member.id))
  }))) }
})
