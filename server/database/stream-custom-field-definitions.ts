import type { Kysely } from 'kysely'
import type { Database, StreamFieldAssignmentTarget } from '~~/shared/types/database'
import type { AgreementCustomFieldSection, AssignedAgencyCustomFieldDefinition } from '~~/shared/types/schemas/agreement-custom-fields'

/**
 * Lists live sections for one Stream and assignment target in display order.
 * @param db - Current database transaction.
 * @param streamId - Owning Stream.
 * @param target - Record type receiving the answers.
 * @returns Configured sections.
 */
export const readStreamCustomFieldSections = async (
  db: Kysely<Database>, streamId: string, target: Exclude<StreamFieldAssignmentTarget, 'activity'> = 'agreement'
): Promise<AgreementCustomFieldSection[]> =>
  (await db.selectFrom('Transfer_Payment_Stream_Field_Section')
    .select(['id', 'egcs_tp_name_en', 'egcs_tp_name_fr', 'egcs_tp_displayorder', 'egcs_tp_beforeentity'])
    .where('egcs_tp_transferpaymentstream', '=', streamId).where('egcs_tp_target', '=', target).where('_deleted', '=', false)
    .orderBy('egcs_tp_displayorder').orderBy('id').execute()).map(section => ({ ...section, id: String(section.id) }))

/**
 * Projects Agency definitions through live Stream assignments. Retired options remain
 * available to display and clear previously saved selections.
 * @param db - Current database transaction.
 * @param streamId - Owning Stream.
 * @param target - Record type receiving the answers.
 * @returns Agency definitions with independent Stream settings.
 */
export const readAssignedAgencyCustomFieldDefinitions = async (
  db: Kysely<Database>, streamId: string, target: StreamFieldAssignmentTarget = 'agreement'
): Promise<AssignedAgencyCustomFieldDefinition[]> => {
  const rows = await db.selectFrom('Transfer_Payment_Stream_Field_Assignment as assignment')
    .innerJoin('Agency_Custom_Field as field', 'field.id', 'assignment.egcs_tp_agencyfield')
    .select([
      'assignment.id as assignmentId', 'assignment.egcs_tp_section', 'assignment.egcs_tp_required',
      'assignment.egcs_tp_active', 'assignment.egcs_tp_displayorder', 'field.id',
      'field.egcs_ay_name_en', 'field.egcs_ay_name_fr', 'field.egcs_ay_kind',
      'field.egcs_ay_multiple', 'field.egcs_ay_presentation', 'field.egcs_ay_discriminator',
      'field.egcs_ay_minimum', 'field.egcs_ay_maximum', 'field.egcs_ay_decimalplaces', 'field.egcs_ay_structure'
    ])
    .where('assignment.egcs_tp_transferpaymentstream', '=', streamId)
    .where('assignment.egcs_tp_target', '=', target)
    .where('assignment._deleted', '=', false).where('field._deleted', '=', false)
    .orderBy('assignment.egcs_tp_displayorder').orderBy('assignment.id').execute()
  if (!rows.length) return []
  const [sections, options] = await Promise.all([
    target === 'activity' ? [] : readStreamCustomFieldSections(db, streamId, target),
    db.selectFrom('Agency_Custom_Field_Option').selectAll()
      .where('egcs_ay_field', 'in', rows.map(row => row.id))
      .where('_deleted', '=', false)
      .orderBy('egcs_ay_displayorder').orderBy('id').execute()
  ])
  return rows.map(row => ({
    ...row,
    id: String(row.id),
    assignmentId: String(row.assignmentId),
    egcs_tp_section: row.egcs_tp_section === null ? null : String(row.egcs_tp_section),
    ...(target === 'activity' ? {} : { section: sections.find(section => section.id === String(row.egcs_tp_section)) }),
    options: options.filter(option => String(option.egcs_ay_field) === String(row.id))
      .map(option => ({
        id: String(option.id), egcs_ay_name_en: option.egcs_ay_name_en,
        egcs_ay_name_fr: option.egcs_ay_name_fr, egcs_ay_category_en: option.egcs_ay_category_en,
        egcs_ay_category_fr: option.egcs_ay_category_fr, egcs_ay_active: option.egcs_ay_active,
        egcs_ay_displayorder: option.egcs_ay_displayorder
      }))
  }))
}
