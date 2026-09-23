import { authorize } from '~~/server/utils/authorize'
import { withActiveAgencyMutationTransaction } from '~~/server/utils/agency-auth'
import { readValidatedBodyI18n, parseI18n } from '~~/server/utils/api-validate'
import { badRequest } from '~~/server/utils/api-errors'
import { AgencyCustomFieldCreateSchema, AgencyCustomFieldPatchSchema } from '~~/shared/types/schemas/agreement-custom-fields'
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
  const patch = await readValidatedBodyI18n(event, AgencyCustomFieldPatchSchema)
  if (!Object.keys(patch).length) {
    return await badRequest(event, 'NO_UPDATABLE_FIELDS', 'apiErrors.request.no_updatable_fields')
  }
  return await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
    const current = await trx.selectFrom('Agency_Custom_Field')
      .selectAll()
      .where('id', '=', fieldId)
      .where('egcs_ay_agency', '=', agencyId)
      .where('_deleted', '=', false)
      .forUpdate()
      .executeTakeFirst()
    if (!current) return await notFound(event, 'CUSTOM_FIELD_NOT_FOUND', 'apiErrors.admin_common.not_found')
    if (patch.egcs_ay_kind !== undefined && patch.egcs_ay_kind !== current.egcs_ay_kind) {
      return await badRequest(event, 'CUSTOM_FIELD_KIND_IMMUTABLE', 'apiErrors.request.invalid_resource')
    }
    if (current.egcs_ay_multiple && patch.egcs_ay_multiple === false) {
      return await badRequest(event, 'CUSTOM_FIELD_SELECTION_MODE_IRREVERSIBLE', 'apiErrors.custom_fields.multiple_to_single')
    }
    const merged = await parseI18n(event, AgencyCustomFieldCreateSchema, {
      egcs_ay_name_en: current.egcs_ay_name_en,
      egcs_ay_name_fr: current.egcs_ay_name_fr,
      egcs_ay_kind: current.egcs_ay_kind,
      egcs_ay_multiple: current.egcs_ay_multiple,
      egcs_ay_presentation: current.egcs_ay_presentation,
      egcs_ay_discriminator: current.egcs_ay_discriminator,
      ...patch
    })
    return await trx.updateTable('Agency_Custom_Field')
      .set(merged)
      .where('id', '=', fieldId)
      .returningAll()
      .executeTakeFirstOrThrow()
  })
})
