import { requireAuthContext, requireFreshAuthContext } from '~~/server/utils/authorize'
import { requireFundingOpportunityAccess } from '~~/server/utils/funding-case-access'
import { badRequest, notFound } from '~~/server/utils/api-errors'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const id = getRouterParam(event, 'id')
  if (!id) return await notFound(event, 'FUNDING_OPPORTUNITY_NOT_FOUND', 'apiErrors.admin_common.not_found')
  const db = event.context.$db
  await requireFundingOpportunityAccess(event, id, 'delete', db)
  return await db.transaction().execute(async trx => {
    const auth = await requireFreshAuthContext(event, trx)
    await requireFundingOpportunityAccess(event, id, 'delete', trx, auth)
    const opportunity = await trx.selectFrom('Funding_Opportunity_Profile').select('id')
      .where('id', '=', id).where('_deleted', '=', false).forUpdate().executeTakeFirst()
    if (!opportunity) return await notFound(event, 'FUNDING_OPPORTUNITY_NOT_FOUND', 'apiErrors.admin_common.not_found')
    const caseRow = await trx.selectFrom('Funding_Case_Intake_Profile').select('id')
      .where('egcs_fi_fundingopportunity', '=', id).where('_deleted', '=', false).executeTakeFirst()
    if (caseRow) return await badRequest(event, 'FUNDING_OPPORTUNITY_HAS_CASES', 'apiErrors.request.invalid_status')
    await trx.updateTable('Funding_Opportunity_Profile').set({ _deleted: true }).where('id', '=', id).execute()
    await trx.updateTable('Common_Entity').set({ _deleted: true }).where('id', '=', id)
      .where('egcs_cn_entitytype', '=', 'fundingopportunity').execute()
    return { success: true }
  })
})
