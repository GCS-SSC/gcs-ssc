import { z } from 'zod'
import type { Kysely } from 'kysely'
import type { H3Event } from 'h3'
import type { Database, StreamFieldAssignmentTarget } from '~~/shared/types/database'
import { agreementCustomFieldMergeSchema, type AgreementCustomFieldSection, type AgreementCustomFieldPatch, type AgreementCustomFieldValues, type AssignedAgencyCustomFieldDefinition } from '~~/shared/types/schemas/agreement-custom-fields'
import { parseI18n } from './api-validate'
import { throwApiError } from './api-errors'

export const readAgreementCustomFieldSections = async (db: Kysely<Database>, streamId: string): Promise<AgreementCustomFieldSection[]> =>
  (await db.selectFrom('Transfer_Payment_Stream_Field_Section').selectAll()
    .where('egcs_tp_transferpaymentstream', '=', streamId).where('_deleted', '=', false)
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
      'field.egcs_ay_multiple', 'field.egcs_ay_presentation', 'field.egcs_ay_discriminator'
    ])
    .where('assignment.egcs_tp_transferpaymentstream', '=', streamId)
    .where('assignment.egcs_tp_target', '=', target)
    .where('assignment._deleted', '=', false).where('field._deleted', '=', false)
    .orderBy('assignment.egcs_tp_displayorder').orderBy('assignment.id').execute()
  if (!rows.length) return []
  const [sections, options] = await Promise.all([
    target === 'agreement' ? readAgreementCustomFieldSections(db, streamId) : [],
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

export const readActivityCustomFieldDefinitions = async (db: Kysely<Database>, streamId: string) =>
  await readAssignedAgencyCustomFieldDefinitions(db, streamId, 'activity')

/**
 * Caller must hold the owning stream and, for updates, Agreement locks.
 * @returns Validated, merged custom-field values.
 * @param event - Localized request event.
 * @param db - Current database transaction.
 * @param streamId - Owning stream identity.
 * @param current - Stored Agreement values.
 * @param patch - Supplied custom-field changes.
 * @param target - Record type receiving the answers.
 */
export const mergeAgreementCustomFields = async (
  event: H3Event, db: Kysely<Database>, streamId: string,
  current: AgreementCustomFieldValues, patch: AgreementCustomFieldPatch, target: StreamFieldAssignmentTarget = 'agreement'
): Promise<AgreementCustomFieldValues> => {
  const definitions = await readAssignedAgencyCustomFieldDefinitions(db, streamId, target)
  const result = await parseI18n(event, z.object({
    egcs_fc_customfields: agreementCustomFieldMergeSchema(definitions, current)
  }), { egcs_fc_customfields: patch })
  return result.egcs_fc_customfields
}

export const validateActivityCustomFieldWrite = async (
  event: H3Event, db: Kysely<Database>, streamId: string,
  current: AgreementCustomFieldValues, patch: AgreementCustomFieldPatch
) => await mergeAgreementCustomFields(event, db, streamId, current, patch, 'activity')

/**
 * Rejects malformed stored relational selections before projecting them to callers.
 * @param event - Localized request event.
 * @param definitions - Assigned field definitions from the same read snapshot.
 * @param values - Stored Agreement values.
 */
export const validatePersistedAgreementCustomFieldSelections = async (
  event: H3Event, definitions: AssignedAgencyCustomFieldDefinition[], values: AgreementCustomFieldValues
): Promise<void> => {
  if (definitions.some(field => field.egcs_ay_kind === 'relational'
    && values[field.id] !== undefined && !Array.isArray(values[field.id]))) {
    await throwApiError(event, { statusCode: 500, code: 'AGREEMENT_CUSTOM_FIELDS_INVALID', key: 'apiErrors.agreement.custom_fields_invalid' })
  }
}
