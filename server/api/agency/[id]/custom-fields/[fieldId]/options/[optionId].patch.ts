import { authorize } from '~~/server/utils/authorize'
import { withActiveAgencyMutationTransaction } from '~~/server/utils/agency-auth'
import { readValidatedBodyI18n, parseI18n } from '~~/server/utils/api-validate'
import { badRequest } from '~~/server/utils/api-errors'
import { AgencyCustomFieldOptionCreateSchema, AgencyCustomFieldOptionPatchSchema } from '~~/shared/types/schemas/agreement-custom-fields'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'id') ?? ''
  const fieldId = getRouterParam(event, 'fieldId') ?? ''
  const optionId = getRouterParam(event, 'optionId') ?? ''
  if (!isPositivePostgresBigintText(agencyId)) {
    return await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found')
  }
  if (!isPositivePostgresBigintText(fieldId) || !isPositivePostgresBigintText(optionId)) {
    return await notFound(event, 'CUSTOM_FIELD_OPTION_NOT_FOUND', 'apiErrors.admin_common.not_found')
  }
  await authorize(event, 'agency', 'update', { type: 'agency', agencyId })
  const patch = await readValidatedBodyI18n(event, AgencyCustomFieldOptionPatchSchema)
  if (!Object.keys(patch).length) {
    return await badRequest(event, 'NO_UPDATABLE_FIELDS', 'apiErrors.request.no_updatable_fields')
  }
  return await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
    const field = await trx.selectFrom('Agency_Custom_Field')
      .select('id')
      .where('id', '=', fieldId)
      .where('egcs_ay_agency', '=', agencyId)
      .where('_deleted', '=', false)
      .forUpdate()
      .executeTakeFirst()
    if (!field) return await notFound(event, 'CUSTOM_FIELD_NOT_FOUND', 'apiErrors.admin_common.not_found')
    const current = await trx.selectFrom('Agency_Custom_Field_Option')
      .selectAll()
      .where('id', '=', optionId)
      .where('egcs_ay_field', '=', fieldId)
      .where('_deleted', '=', false)
      .forUpdate()
      .executeTakeFirst()
    if (!current) return await notFound(event, 'CUSTOM_FIELD_OPTION_NOT_FOUND', 'apiErrors.admin_common.not_found')
    const merged = await parseI18n(event, AgencyCustomFieldOptionCreateSchema, {
      egcs_ay_name_en: current.egcs_ay_name_en,
      egcs_ay_name_fr: current.egcs_ay_name_fr,
      egcs_ay_category_en: current.egcs_ay_category_en,
      egcs_ay_category_fr: current.egcs_ay_category_fr,
      egcs_ay_active: current.egcs_ay_active,
      egcs_ay_displayorder: current.egcs_ay_displayorder,
      ...patch
    })
    return await trx.updateTable('Agency_Custom_Field_Option')
      .set(merged)
      .where('id', '=', optionId)
      .returningAll()
      .executeTakeFirstOrThrow()
  })
})
