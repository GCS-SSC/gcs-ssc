import { authorize } from '~~/server/utils/authorize'
import { withActiveAgencyMutationTransaction } from '~~/server/utils/agency-auth'
import { notFound } from '~~/server/utils/api-errors'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'id') ?? ''
  const fieldId = getRouterParam(event, 'fieldId') ?? ''
  if (!isPositivePostgresBigintText(agencyId)) {
    return await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found')
  }
  if (!isPositivePostgresBigintText(fieldId)) {
    return await notFound(event, 'CUSTOM_FIELD_NOT_FOUND', 'apiErrors.admin_common.not_found')
  }
  await authorize(event, 'agency', 'update', { type: 'agency', agencyId })
  return await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
    const field = await trx.selectFrom('Agency_Custom_Field')
      .select('id')
      .where('id', '=', fieldId)
      .where('egcs_ay_agency', '=', agencyId)
      .where('_deleted', '=', false)
      .forUpdate()
      .executeTakeFirst()
    if (!field) return await notFound(event, 'CUSTOM_FIELD_NOT_FOUND', 'apiErrors.admin_common.not_found')
    await trx.updateTable('Agency_Custom_Field')
      .set({ _deleted: true })
      .where('id', '=', fieldId)
      .execute()
    return { success: true }
  })
})
