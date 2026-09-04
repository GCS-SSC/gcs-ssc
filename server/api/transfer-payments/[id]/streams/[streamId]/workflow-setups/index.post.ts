import { CommonWorkflowSetupCreateSchema } from '~~/shared/types/schemas'
import { authorize } from '~~/server/utils/authorize'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'
import { supportsWorkflowConfiguration } from '~~/server/utils/entity-type-registry'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  if (!profileId || !streamId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  const streamContext = await authorizeTransferPaymentStreamResource(event, 'create', profileId, streamId)
  if (!streamContext) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  await authorize(event, 'transfer_payment', 'create', createTransferPaymentScopedAuthorizeHandler('create', streamContext.scope, db))
  const body = await readValidatedBodyI18n(event, CommonWorkflowSetupCreateSchema)
  return await executeFreshAuthorizedTransferPaymentStreamWrite(
    event, db, profileId, streamContext.agencyId, streamId, 'create', async trx => {
      if (body.egcs_cn_scopetype !== 'transferpaymentstream' || body.egcs_cn_scopeid !== streamId) {
        return await badRequest(event, 'WORKFLOW_SCOPE_MISMATCH', 'apiErrors.request.invalid')
      }
      if (!await supportsWorkflowConfiguration(trx, body.egcs_cn_entitytype, body.egcs_cn_purpose)) {
        return await badRequest(event, 'WORKFLOW_TARGET_TYPE_INVALID', 'apiErrors.request.invalid')
      }
      const { egcs_cn_allowedstartstatuses: allowedStartStatuses, ...values } = body
      const setup = await trx.insertInto('Common_Workflow_Setup').values({
        ...values,
        _deleted: false
      }).returningAll().executeTakeFirstOrThrow()
      await trx.insertInto('Common_Workflow_Setup_Allowed_Start_Status').values(
        allowedStartStatuses.map((statusId, index) => ({
          egcs_cn_workflowsetup: String(setup.id),
          egcs_cn_status: statusId,
          egcs_cn_order: index + 1,
          _deleted: false
        }))
      ).execute()
      return {
        ...setup,
        egcs_cn_allowedstartstatuses: allowedStartStatuses,
        publicationId: String(setup.id),
        publicationState: 'draft' as const,
        publicationVersionId: null,
        publicationVersion: null,
        hasUnpublishedChanges: true
      }
    }
  )
})
