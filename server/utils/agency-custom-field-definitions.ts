import type { Kysely } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { AgencyCustomFieldDefinition } from '~~/shared/types/schemas/agreement-custom-fields'

/**
 * Reads portable Agency field definitions for Workflow condition authoring.
 * @param db - Current database transaction.
 * @param agencyId - Owning Agency.
 * @returns Live Agency definitions and options, including inactive options for labels.
 */
export const readAgencyCustomFieldDefinitions = async (
  db: Kysely<Database>, agencyId: string
): Promise<AgencyCustomFieldDefinition[]> => {
  const fields = await db.selectFrom('Agency_Custom_Field').selectAll()
    .where('egcs_ay_agency', '=', agencyId).where('_deleted', '=', false)
    .orderBy('id').execute()
  if (!fields.length) return []
  const options = await db.selectFrom('Agency_Custom_Field_Option').selectAll()
    .where('egcs_ay_field', 'in', fields.map(field => field.id))
    .where('_deleted', '=', false).orderBy('egcs_ay_displayorder').orderBy('id').execute()
  return fields.map(field => ({
    id: String(field.id), egcs_ay_name_en: field.egcs_ay_name_en,
    egcs_ay_name_fr: field.egcs_ay_name_fr, egcs_ay_kind: field.egcs_ay_kind,
    egcs_ay_multiple: field.egcs_ay_multiple, egcs_ay_presentation: field.egcs_ay_presentation,
    egcs_ay_discriminator: field.egcs_ay_discriminator,
    options: options.filter(option => String(option.egcs_ay_field) === String(field.id)).map(option => ({
      id: String(option.id), egcs_ay_name_en: option.egcs_ay_name_en,
      egcs_ay_name_fr: option.egcs_ay_name_fr, egcs_ay_category_en: option.egcs_ay_category_en,
      egcs_ay_category_fr: option.egcs_ay_category_fr, egcs_ay_active: option.egcs_ay_active,
      egcs_ay_displayorder: option.egcs_ay_displayorder
    }))
  }))
}
