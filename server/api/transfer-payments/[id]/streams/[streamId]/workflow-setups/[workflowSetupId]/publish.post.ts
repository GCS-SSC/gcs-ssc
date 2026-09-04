import { authorize } from '~~/server/utils/authorize'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { isExpectedPublicationFailure, throwIfPublicationSelectionConflict } from '~~/server/utils/publication-errors'
import { publishDefinition } from '~~/server/utils/system-publication'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'
import { buildWorkflowSetupPublication, resolveWorkflowPublicationActorId } from '~~/server/utils/workflow-setup-versioning'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  const workflowSetupId = getRouterParam(event, 'workflowSetupId')
  if (!profileId || !streamId || !workflowSetupId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  const context = await authorizeTransferPaymentStreamResource(event, 'update', profileId, streamId)
  if (!context) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  await authorize(event, 'transfer_payment', 'update', createTransferPaymentScopedAuthorizeHandler('update', context.scope, db))
  try {
    return await executeFreshAuthorizedTransferPaymentStreamWrite(
      event, db, profileId, context.agencyId, streamId, 'update', async (trx, _freshContext, authContext) => {
        const setup = await trx.selectFrom('Common_Workflow_Setup').selectAll().where('id', '=', workflowSetupId)
          .where('egcs_cn_scopeid', '=', streamId).where('egcs_cn_scopetype', '=', 'transferpaymentstream')
          .where('_deleted', '=', false).forUpdate().executeTakeFirst()
        if (!setup) return await notFound(event, 'WORKFLOW_SETUP_NOT_FOUND', 'apiErrors.admin_common.not_found')
        const actorId = await resolveWorkflowPublicationActorId(trx, authContext.userId)
        if (!actorId) return await notFound(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')
        let plan
        try {
          plan = await buildWorkflowSetupPublication(trx, setup)
        } catch (error: unknown) {
          if (!isExpectedPublicationFailure(error)) throw error
          return await badRequest(event, 'WORKFLOW_SETUP_INVALID_PUBLICATION', 'apiErrors.request.invalid_resource')
        }
        const published = await publishDefinition(trx, {
          publicationId: workflowSetupId,
          kind: 'workflow_setup',
          definition: plan.definition,
          actorId,
          references: plan.references,
          workflowStatuses: plan.statuses,
          selections: setup.egcs_cn_purpose === 'standard'
            ? []
            : [{
                dimension: 'scope_entity_purpose',
                key: `${setup.egcs_cn_scopetype}:${setup.egcs_cn_scopeid}:${setup.egcs_cn_entitytype}:${setup.egcs_cn_purpose}`
              }]
        })
        const { definition: _definition, hash: _hash, ...metadata } = published
        return { ...setup, id: String(setup.id), egcs_cn_scopeid: String(setup.egcs_cn_scopeid), ...metadata }
      }
    )
  } catch (error) {
    return await throwIfPublicationSelectionConflict(event, error)
  }
})
