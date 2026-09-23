import { authorize } from '~~/server/utils/authorize'
import { withActiveAgencyReadTransaction } from '~~/server/utils/agency-auth'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { badRequest, notFound } from '~~/server/utils/api-errors'

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'agencyId')
  const chartId = getRouterParam(event, 'chartId')
  if (!agencyId || !chartId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  if (!isPositivePostgresBigintText(agencyId) || !isPositivePostgresBigintText(chartId)) {
    return await notFound(event, 'CHART_OF_ACCOUNT_NOT_FOUND', 'apiErrors.transfer_payment.chart_of_account_not_found')
  }
  await authorize(event, 'agency', 'read', { type: 'agency', agencyId })
  return await withActiveAgencyReadTransaction(event, agencyId, async trx => {
    const chart = await trx.selectFrom('Agency_Chart_of_Account')
      .innerJoin('Agency_Fiscal_Year', 'Agency_Fiscal_Year.id', 'Agency_Chart_of_Account.egcs_ay_fiscalyear')
      .where('Agency_Chart_of_Account.id', '=', chartId)
      .where('Agency_Chart_of_Account.egcs_ay_organizationagency', '=', agencyId)
      .where('Agency_Chart_of_Account._deleted', '=', false)
      .selectAll('Agency_Chart_of_Account')
      .select('Agency_Fiscal_Year.egcs_ay_fiscalyeardisplay as fiscal_year_display')
      .executeTakeFirst()
    return chart ?? await notFound(event, 'CHART_OF_ACCOUNT_NOT_FOUND', 'apiErrors.transfer_payment.chart_of_account_not_found')
  })
})
