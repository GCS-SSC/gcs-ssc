import { sql } from 'kysely'
import { AgencyChartOfAccountPatchSchema } from '~~/shared/types/schemas/transfer-payment'
import { authorize } from '~~/server/utils/authorize'
import { withActiveAgencyMutationTransaction } from '~~/server/utils/agency-auth'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { throwIfAgencyUniqueConstraintError } from '~~/server/utils/agency-unique-constraint-errors'

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'agencyId')
  const chartId = getRouterParam(event, 'chartId')
  if (!agencyId || !chartId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  if (!isPositivePostgresBigintText(agencyId) || !isPositivePostgresBigintText(chartId)) return await notFound(event, 'CHART_OF_ACCOUNT_NOT_FOUND', 'apiErrors.transfer_payment.chart_of_account_not_found')
  await authorize(event, 'agency', 'update', { type: 'agency', agencyId })
  const body = await readValidatedBodyI18n(event, AgencyChartOfAccountPatchSchema)
  if (Object.keys(body).length === 0) return await badRequest(event, 'NO_UPDATABLE_FIELDS', 'apiErrors.request.no_updatable_fields')
  try {
    return await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
      const current = await trx.selectFrom('Agency_Chart_of_Account').selectAll()
        .where('id', '=', chartId).where('egcs_ay_organizationagency', '=', agencyId)
        .where('_deleted', '=', false).forUpdate().executeTakeFirst()
      if (!current) return await notFound(event, 'CHART_OF_ACCOUNT_NOT_FOUND', 'apiErrors.transfer_payment.chart_of_account_not_found')
      if (body.egcs_ay_fiscalyear !== undefined && String(body.egcs_ay_fiscalyear) !== String(current.egcs_ay_fiscalyear)) {
        return await badRequest(event, 'AGENCY_CHART_FISCAL_YEAR_IMMUTABLE', 'apiErrors.agency.chart_fiscal_year_immutable')
      }
      if (!body.egcs_ay_accountingdimensions) return current
      return await trx.updateTable('Agency_Chart_of_Account').set({
        egcs_ay_accountingdimensions: sql`${JSON.stringify(body.egcs_ay_accountingdimensions)}::jsonb`
      }).where('id', '=', chartId).where('egcs_ay_organizationagency', '=', agencyId).returningAll().executeTakeFirstOrThrow()
    })
  } catch (error: unknown) {
    await throwIfAgencyUniqueConstraintError(event, error)
    throw error
  }
})
