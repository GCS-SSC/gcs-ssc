import { authorize } from '~~/server/utils/authorize'
import { withActiveAgencyReadTransaction } from '~~/server/utils/agency-auth'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'agencyId') ?? ''
  if (!isPositivePostgresBigintText(agencyId)) {
    return await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found')
  }
  await authorize(event, 'agency', 'read', { type: 'agency', agencyId })
  return await withActiveAgencyReadTransaction(event, agencyId, async trx => {
    const items = await trx.selectFrom('Agency_Custom_Field')
      .selectAll()
      .where('egcs_ay_agency', '=', agencyId)
      .where('_deleted', '=', false)
      .orderBy('id', 'asc')
      .execute()
    const options = await trx.selectFrom('Agency_Custom_Field_Option')
      .innerJoin('Agency_Custom_Field', 'Agency_Custom_Field.id', 'Agency_Custom_Field_Option.egcs_ay_field')
      .select([
        'Agency_Custom_Field_Option.id',
        'Agency_Custom_Field_Option.egcs_ay_field',
        'Agency_Custom_Field_Option.egcs_ay_name_en',
        'Agency_Custom_Field_Option.egcs_ay_name_fr',
        'Agency_Custom_Field_Option.egcs_ay_category_en',
        'Agency_Custom_Field_Option.egcs_ay_category_fr',
        'Agency_Custom_Field_Option.egcs_ay_active',
        'Agency_Custom_Field_Option.egcs_ay_displayorder'
      ])
      .where('Agency_Custom_Field.egcs_ay_agency', '=', agencyId)
      .where('Agency_Custom_Field._deleted', '=', false)
      .where('Agency_Custom_Field_Option._deleted', '=', false)
      .orderBy('Agency_Custom_Field_Option.egcs_ay_displayorder', 'asc')
      .orderBy('Agency_Custom_Field_Option.id', 'asc')
      .execute()
    return { items: items.map(field => ({ ...field, options: options.filter(option => option.egcs_ay_field === field.id) })) }
  })
})
