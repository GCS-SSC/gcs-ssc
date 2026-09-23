import { authorize } from '~~/server/utils/authorize'
import { withActiveAgencyMutationTransaction } from '~~/server/utils/agency-auth'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { badRequest, notFound } from '~~/server/utils/api-errors'

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'agencyId')
  const chartId = getRouterParam(event, 'chartId')
  if (!agencyId || !chartId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  if (!isPositivePostgresBigintText(agencyId) || !isPositivePostgresBigintText(chartId)) return await notFound(event, 'CHART_OF_ACCOUNT_NOT_FOUND', 'apiErrors.transfer_payment.chart_of_account_not_found')
  await authorize(event, 'agency', 'delete', { type: 'agency', agencyId })
  return await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
    const current = await trx.selectFrom('Agency_Chart_of_Account').select('id')
      .where('id', '=', chartId).where('egcs_ay_organizationagency', '=', agencyId)
      .where('_deleted', '=', false).forUpdate().executeTakeFirst()
    if (!current) return await notFound(event, 'CHART_OF_ACCOUNT_NOT_FOUND', 'apiErrors.transfer_payment.chart_of_account_not_found')
    const linked = await trx.selectFrom('Transfer_Payment_Stream_Chart_of_Account').select('id')
      .where('egcs_tp_agencychartofaccount', '=', chartId).where('_deleted', '=', false).forUpdate().executeTakeFirst()
    if (linked) return await badRequest(event, 'TRANSFER_PAYMENT_CHART_OF_ACCOUNT_IN_USE', 'apiErrors.transfer_payment.chart_of_account_in_use')
    await trx.updateTable('Agency_Chart_of_Account').set({ _deleted: true }).where('id', '=', chartId).execute()
    return { success: true }
  })
})
