import { replaceWorkflowConditions } from '~~/server/utils/workflow-conditions'
import { sql } from 'kysely'
import { CommonWorkflowSetupMemberPatchSchema } from '~~/shared/types/schemas'
import { authorize } from '~~/server/utils/authorize'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'
import { replaceWorkflowSetupMemberOwners } from '~~/server/utils/workflow-setup-members'
import { lockWorkflowSetupForMutation } from '~~/server/utils/workflow-setup-versioning'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  const workflowSetupId = getRouterParam(event, 'workflowSetupId')
  const memberId = getRouterParam(event, 'memberId')
  if (!profileId || !streamId || !workflowSetupId || !memberId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  const context = await authorizeTransferPaymentStreamResource(event, 'update', profileId, streamId)
  if (!context) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  if (!isPositivePostgresBigintText(workflowSetupId) || !isPositivePostgresBigintText(memberId)) {
    return await notFound(event, 'WORKFLOW_MEMBER_NOT_FOUND', 'apiErrors.admin_common.not_found')
  }
  await authorize(event, 'transfer_payment', 'update', createTransferPaymentScopedAuthorizeHandler('update', context.scope, db))
  const body = await readValidatedBodyI18n(event, CommonWorkflowSetupMemberPatchSchema)
  if (Object.keys(body).length === 0) {
    return await badRequest(event, 'NO_UPDATABLE_FIELDS', 'apiErrors.request.no_updatable_fields')
  }
  return await executeFreshAuthorizedTransferPaymentStreamWrite(event, db, profileId, context.agencyId, streamId, 'update', async trx => {
    const setup = await lockWorkflowSetupForMutation(trx, workflowSetupId, streamId)
    if (!setup) return await notFound(event, 'WORKFLOW_SETUP_NOT_FOUND', 'apiErrors.admin_common.not_found')
    if (setup.publicationState === 'retired') {
      return await throwApiError(event, {
        statusCode: 409, code: 'PUBLICATION_RETIRED', key: 'apiErrors.request.invalid_status'
      })
    }
    const members = await trx.selectFrom('Common_Workflow_Setup_Member').selectAll()
      .where('egcs_cn_workflowsetup', '=', workflowSetupId).where('_deleted', '=', false)
      .orderBy('egcs_cn_sequence', 'asc').forUpdate().execute()
    const current = members.find(member => String(member.id) === memberId)
    if (!current) return await notFound(event, 'WORKFLOW_MEMBER_NOT_FOUND', 'apiErrors.admin_common.not_found')
    const requestedSequence = body.egcs_cn_sequence
    const { egcs_cn_sequence: _sequence, owners, conditions, ...values } = body
    if (requestedSequence && requestedSequence !== current.egcs_cn_sequence) {
      const ordered = members.filter(member => String(member.id) !== memberId)
      ordered.splice(Math.min(requestedSequence, members.length) - 1, 0, current)
      await trx.updateTable('Common_Workflow_Setup_Member')
        .set({ egcs_cn_sequence: sql<number>`egcs_cn_sequence + 100000` })
        .where('id', 'in', members.map(member => String(member.id))).execute()
      for (const [index, member] of ordered.entries()) {
        await trx.updateTable('Common_Workflow_Setup_Member').set({ egcs_cn_sequence: index + 1 })
          .where('id', '=', String(member.id)).execute()
      }
    }
    const updated = Object.keys(values).length === 0
      ? current
      : await trx.updateTable('Common_Workflow_Setup_Member').set(values).where('id', '=', memberId)
          .where('egcs_cn_workflowsetup', '=', workflowSetupId).where('_deleted', '=', false).returningAll().executeTakeFirstOrThrow()
    if (owners && !await replaceWorkflowSetupMemberOwners(trx, updated, owners)) {
      return await badRequest(event, 'WORKFLOW_MEMBER_OWNERS_INVALID', 'apiErrors.request.invalid_resource')
    }
    if (conditions && !await replaceWorkflowConditions(trx, streamId, String(updated.id), conditions)) {
      return await badRequest(event, 'WORKFLOW_CONDITIONS_INVALID', 'apiErrors.request.invalid_resource')
    }
    return updated
  })
})
