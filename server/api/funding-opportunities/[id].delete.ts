import { defineEventHandler, getRouterParam } from 'h3'
import { requireAuthContext, requireFreshAuthContext } from '~~/server/utils/authorize'
import { requireFundingOpportunityAccess } from '~~/server/utils/funding-case-access'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { lockRegisteredExtensionAgreementScopes } from '~~/server/utils/extensions'
import { lockTransferPaymentStreams } from '~~/server/utils/transfer-payment-stream-lock'
import { assertFundingOpportunityWritable, getFundingOpportunityStatus } from '~~/server/utils/funding-opportunity-status'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const id = getRouterParam(event, 'id')
  if (!id) return await notFound(event, 'FUNDING_OPPORTUNITY_NOT_FOUND', 'apiErrors.admin_common.not_found')
  const db = event.context.$db
  await requireFundingOpportunityAccess(event, id, 'delete', db)
  return await db.transaction().execute(async trx => {
    const auth = await requireFreshAuthContext(event, trx)
    const scope = await requireFundingOpportunityAccess(event, id, 'delete', trx, auth)
    await lockRegisteredExtensionAgreementScopes(trx, scope.agencyId, scope.streamIds)
    const agency = await trx.selectFrom('Agency_Profile').select('id')
      .where('id', '=', scope.agencyId).where('_deleted', '=', false).forShare().executeTakeFirst()
    const program = await trx.selectFrom('Transfer_Payment_Profile').select('egcs_tp_agency')
      .where('id', '=', scope.transferPaymentId).where('_deleted', '=', false).forUpdate().executeTakeFirst()
    if (!agency || !program || String(program.egcs_tp_agency) !== scope.agencyId) {
      return await notFound(event, 'FUNDING_OPPORTUNITY_NOT_FOUND', 'apiErrors.admin_common.not_found')
    }
    await lockTransferPaymentStreams(trx, scope.streamIds)
    const opportunity = await trx.selectFrom('Funding_Opportunity_Profile').select(['id', 'egcs_fo_status'])
      .where('id', '=', id).where('_deleted', '=', false).forUpdate().executeTakeFirst()
    if (!opportunity) return await notFound(event, 'FUNDING_OPPORTUNITY_NOT_FOUND', 'apiErrors.admin_common.not_found')
    const lockedScope = await requireFundingOpportunityAccess(event, id, 'delete', trx, auth)
    if (lockedScope.agencyId !== scope.agencyId || lockedScope.transferPaymentId !== scope.transferPaymentId
      || lockedScope.streamIds.some(streamId => !scope.streamIds.includes(streamId))) {
      return await notFound(event, 'FUNDING_OPPORTUNITY_NOT_FOUND', 'apiErrors.admin_common.not_found')
    }
    await assertFundingOpportunityWritable(event,
      await getFundingOpportunityStatus(trx, String(opportunity.egcs_fo_status), scope.agencyId))
    const caseRow = await trx.selectFrom('Funding_Case_Intake_Profile').select('id')
      .where('egcs_fi_fundingopportunity', '=', id).where('_deleted', '=', false).executeTakeFirst()
    if (caseRow) return await badRequest(event, 'FUNDING_OPPORTUNITY_HAS_CASES', 'apiErrors.request.invalid_status')
    await trx.updateTable('Funding_Opportunity_Profile').set({ _deleted: true }).where('id', '=', id).execute()
    await trx.updateTable('Common_Entity').set({ _deleted: true }).where('id', '=', id)
      .where('egcs_cn_entitytype', '=', 'fundingopportunity').execute()
    return { success: true }
  })
})
