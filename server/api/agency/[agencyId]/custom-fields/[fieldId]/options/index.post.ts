import { authorize } from '~~/server/utils/authorize'
import { withActiveAgencyMutationTransaction } from '~~/server/utils/agency-auth'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { badRequest } from '~~/server/utils/api-errors'
import { AgencyCustomFieldOptionCreateSchema } from '~~/shared/types/schemas/agreement-custom-fields'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'agencyId') ?? ''
  const fieldId = getRouterParam(event, 'fieldId') ?? ''
  if (!isPositivePostgresBigintText(agencyId)) {
    return await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found')
  }
  if (!isPositivePostgresBigintText(fieldId)) {
    return await notFound(event, 'CUSTOM_FIELD_NOT_FOUND', 'apiErrors.admin_common.not_found')
  }
  await authorize(event, 'agency', 'update', { type: 'agency', agencyId })
  const body = await readValidatedBodyI18n(event, AgencyCustomFieldOptionCreateSchema)
  return await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
    const field = await trx.selectFrom('Agency_Custom_Field')
      .select(['id', 'egcs_ay_kind'])
      .where('id', '=', fieldId)
      .where('egcs_ay_agency', '=', agencyId)
      .where('_deleted', '=', false)
      .forUpdate()
      .executeTakeFirst()
    if (!field) return await notFound(event, 'CUSTOM_FIELD_NOT_FOUND', 'apiErrors.admin_common.not_found')
    if (field.egcs_ay_kind !== 'relational') {
      return await badRequest(event, 'INVALID_FIELD_KIND', 'apiErrors.request.invalid_resource')
    }
    return await trx.insertInto('Agency_Custom_Field_Option')
      .values({ ...body, egcs_ay_field: fieldId })
      .returningAll()
      .executeTakeFirstOrThrow()
  })
})
