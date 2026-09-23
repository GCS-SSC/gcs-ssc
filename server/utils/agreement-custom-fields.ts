import { z } from 'zod'
import type { Kysely } from 'kysely'
import type { H3Event } from 'h3'
import type { Database } from '~~/shared/types/database'
import { agreementCustomFieldMergeSchema, type AgreementCustomFieldSection, type AgreementCustomFieldPatch, type AgreementCustomFieldValues, type AssignedAgencyCustomFieldDefinition, type AgencyCustomFieldDefinition } from '~~/shared/types/schemas/agreement-custom-fields'
import { parseI18n } from './api-validate'

export const readAgreementCustomFieldSections = async (db: Kysely<Database>, streamId: string): Promise<AgreementCustomFieldSection[]> =>
  (await db.selectFrom('Transfer_Payment_Stream_Field_Section').selectAll()
    .where('egcs_tp_transferpaymentstream', '=', streamId).where('_deleted', '=', false)
    .orderBy('egcs_tp_displayorder').orderBy('id').execute()).map(section => ({ ...section, id: String(section.id) }))

/**
 * Projects Agency definitions through live Stream assignments. Retired options remain
 * available to display and clear previously saved selections.
 * @param db - Current database transaction.
 * @param streamId - Owning Stream.
 * @returns Agency definitions with independent Stream settings.
 */
export const readAssignedAgencyCustomFieldDefinitions = async (
  db: Kysely<Database>, streamId: string
): Promise<AssignedAgencyCustomFieldDefinition[]> => {
  const rows = await db.selectFrom('Transfer_Payment_Stream_Field_Assignment as assignment')
    .innerJoin('Agency_Custom_Field as field', 'field.id', 'assignment.egcs_tp_agencyfield')
    .select([
      'assignment.id as assignmentId', 'assignment.egcs_tp_section', 'assignment.egcs_tp_required',
      'assignment.egcs_tp_active', 'assignment.egcs_tp_displayorder', 'field.id',
      'field.egcs_ay_name_en', 'field.egcs_ay_name_fr', 'field.egcs_ay_kind',
      'field.egcs_ay_multiple', 'field.egcs_ay_presentation', 'field.egcs_ay_discriminator'
    ])
    .where('assignment.egcs_tp_transferpaymentstream', '=', streamId)
    .where('assignment._deleted', '=', false).where('field._deleted', '=', false)
    .orderBy('assignment.egcs_tp_displayorder').orderBy('assignment.id').execute()
  if (!rows.length) return []
  const [sections, options] = await Promise.all([
    readAgreementCustomFieldSections(db, streamId),
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
    section: sections.find(section => section.id === String(row.egcs_tp_section)),
    options: options.filter(option => String(option.egcs_ay_field) === String(row.id))
      .map(option => ({
        id: String(option.id), egcs_ay_name_en: option.egcs_ay_name_en,
        egcs_ay_name_fr: option.egcs_ay_name_fr, egcs_ay_category_en: option.egcs_ay_category_en,
        egcs_ay_category_fr: option.egcs_ay_category_fr, egcs_ay_active: option.egcs_ay_active,
        egcs_ay_displayorder: option.egcs_ay_displayorder
      }))
  }))
}

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

/**
 * Caller must hold the owning stream and, for updates, Agreement locks.
 * @returns Validated, merged custom-field values.
 * @param event - Localized request event.
 * @param db - Current database transaction.
 * @param streamId - Owning stream identity.
 * @param current - Stored Agreement values.
 * @param patch - Supplied custom-field changes.
 */
export const mergeAgreementCustomFields = async (
  event: H3Event, db: Kysely<Database>, streamId: string,
  current: AgreementCustomFieldValues, patch: AgreementCustomFieldPatch
): Promise<AgreementCustomFieldValues> => {
  const definitions = await readAssignedAgencyCustomFieldDefinitions(db, streamId)
  const result = await parseI18n(event, z.object({
    egcs_fc_customfields: agreementCustomFieldMergeSchema(definitions, current)
  }), { egcs_fc_customfields: patch })
  return result.egcs_fc_customfields
}
