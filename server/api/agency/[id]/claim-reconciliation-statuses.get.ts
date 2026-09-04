import { authorize } from '~~/server/utils/authorize'
import { withActiveAgencyReadTransaction } from '~~/server/utils/agency-auth'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'id')
  if (!agencyId) return await badRequest(event, 'MISSING_AGENCY_ID', 'apiErrors.request.missing_agency_id')
  if (!isPositivePostgresBigintText(agencyId)) return await badRequest(event, 'INVALID_ID', 'apiErrors.request.invalid_id')
  await authorize(event, 'agency', 'read', { type: 'agency', agencyId })

  return await withActiveAgencyReadTransaction(event, agencyId, async trx => {
    const agency = await trx.selectFrom('Agency_Profile')
      .select(['egcs_ay_claimreconciliationstartstatus', 'egcs_ay_claimreconciliationfinalstatus'])
      .where('id', '=', agencyId)
      .where('_deleted', '=', false)
      .executeTakeFirstOrThrow()

    return {
      startStatusId: agency.egcs_ay_claimreconciliationstartstatus ?? null,
      finalStatusId: agency.egcs_ay_claimreconciliationfinalstatus ?? null
    }
  })
})
