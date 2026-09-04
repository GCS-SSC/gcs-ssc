import { CommonWorkflowSetupCreateSchema, CommonWorkflowSetupPatchSchema } from '~~/shared/types/schemas'
import { authorize } from '~~/server/utils/authorize'
import { parseI18n, readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { lockWorkflowSetupForMutation, readWorkflowSetupPublicationMetadata } from '~~/server/utils/workflow-setup-versioning'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'
import { supportsWorkflowConfiguration } from '~~/server/utils/entity-type-registry'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  const workflowSetupId = getRouterParam(event, 'workflowSetupId')
  if (!profileId || !streamId || !workflowSetupId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  if (!isPositivePostgresBigintText(workflowSetupId)) return await notFound(event, 'WORKFLOW_SETUP_NOT_FOUND', 'apiErrors.admin_common.not_found')
  const streamContext = await authorizeTransferPaymentStreamResource(event, 'update', profileId, streamId)
  if (!streamContext) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  await authorize(event, 'transfer_payment', 'update', createTransferPaymentScopedAuthorizeHandler('update', streamContext.scope, db))
  const body = await readValidatedBodyI18n(event, CommonWorkflowSetupPatchSchema)
  const {
    egcs_cn_scopetype: _scopeType,
    egcs_cn_scopeid: _scopeId,
    egcs_cn_allowedstartstatuses: allowedStartStatuses,
    ...values
  } = body
  void _scopeType
  void _scopeId
  delete values._deleted
  if (Object.keys(values).length === 0 && allowedStartStatuses === undefined) {
    return await badRequest(event, 'NO_UPDATABLE_FIELDS', 'apiErrors.request.no_updatable_fields')
  }
  const setup = await executeFreshAuthorizedTransferPaymentStreamWrite(
    event, db, profileId, streamContext.agencyId, streamId, 'update', async trx => {
      const current = await lockWorkflowSetupForMutation(trx, workflowSetupId, streamId)
      if (!current) return await notFound(event, 'WORKFLOW_SETUP_NOT_FOUND', 'apiErrors.admin_common.not_found')
      if (current.publicationState === 'retired') {
        return await throwApiError(event, {
          statusCode: 409, code: 'PUBLICATION_RETIRED', key: 'apiErrors.request.invalid_status'
        })
      }
      const currentAllowedRows = await trx.selectFrom('Common_Workflow_Setup_Allowed_Start_Status')
        .select('egcs_cn_status').where('egcs_cn_workflowsetup', '=', workflowSetupId)
        .where('_deleted', '=', false).orderBy('egcs_cn_order', 'asc').forUpdate().execute()
      const nextAllowedStatuses = allowedStartStatuses ?? currentAllowedRows.map(row => String(row.egcs_cn_status))
      await parseI18n(event, CommonWorkflowSetupCreateSchema, {
        ...current,
        ...values,
        egcs_cn_allowedstartstatuses: nextAllowedStatuses
      })
      const nextEntityType = values.egcs_cn_entitytype ?? current.egcs_cn_entitytype
      const nextPurpose = values.egcs_cn_purpose ?? current.egcs_cn_purpose
      if (!await supportsWorkflowConfiguration(trx, nextEntityType, nextPurpose)) {
        return await badRequest(event, 'UNSUPPORTED_WORKFLOW_ENTITY_TYPE', 'apiErrors.request.invalid')
      }
      if (allowedStartStatuses) {
        await trx.updateTable('Common_Workflow_Setup_Allowed_Start_Status').set({ _deleted: true })
          .where('egcs_cn_workflowsetup', '=', workflowSetupId).where('_deleted', '=', false).execute()
        await trx.insertInto('Common_Workflow_Setup_Allowed_Start_Status').values(
          allowedStartStatuses.map((statusId, index) => ({
            egcs_cn_workflowsetup: workflowSetupId,
            egcs_cn_status: statusId,
            egcs_cn_order: index + 1,
            _deleted: false
          }))
        ).execute()
      }
      const updated = await trx.updateTable('Common_Workflow_Setup').set(values).where('id', '=', workflowSetupId)
        .where('egcs_cn_scopetype', '=', 'transferpaymentstream').where('egcs_cn_scopeid', '=', streamId)
        .where('_deleted', '=', false).returningAll().executeTakeFirstOrThrow()
      return { ...updated, egcs_cn_allowedstartstatuses: nextAllowedStatuses }
    }
  )
  if (!setup || typeof setup !== 'object' || !('id' in setup)) return setup
  return { ...setup, ...await readWorkflowSetupPublicationMetadata(db, setup) }
})
