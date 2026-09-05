/* eslint-disable jsdoc/require-jsdoc -- Stream-serialized custom-field value validation. */
import { z } from 'zod'
import type { Kysely } from 'kysely'
import type { H3Event } from 'h3'
import type { Database } from '~~/shared/types/database'
import { agreementCustomFieldMergeSchema, type AgreementCustomFieldSection, type AgreementCustomFieldDefinition, type AgreementCustomFieldPatch } from '~~/shared/types/schemas/agreement-custom-fields'
import { parseI18n } from './api-validate'

export const readAgreementCustomFieldSections = async (db: Kysely<Database>, streamId: string): Promise<AgreementCustomFieldSection[]> =>
  (await db.selectFrom('Transfer_Payment_Stream_Field_Section').selectAll()
    .where('egcs_tp_transferpaymentstream', '=', streamId).where('_deleted', '=', false)
    .orderBy('display_order').orderBy('id').execute()).map(section => ({ ...section, id: String(section.id) }))

export const readAgreementCustomFieldDefinitions = async (
  db: Kysely<Database>, streamId: string
): Promise<AgreementCustomFieldDefinition[]> => {
  const fields = await db.selectFrom('Transfer_Payment_Stream_Field').selectAll()
    .where('egcs_tp_transferpaymentstream', '=', streamId).where('_deleted', '=', false)
    .orderBy('display_order').orderBy('id').execute()
  if (!fields.length) return []
  const sections = await readAgreementCustomFieldSections(db, streamId)
  const options = await db.selectFrom('Transfer_Payment_Stream_Field_Option').selectAll()
    .where('field_id', 'in', fields.map(field => field.id)).where('_deleted', '=', false)
    .orderBy('display_order').orderBy('id').execute()
  return fields.map(field => ({
    ...field,
    id: String(field.id),
    section_id: String(field.section_id),
    section: sections.find(section => section.id === String(field.section_id)),
    options: options.filter(option => String(option.field_id) === String(field.id)).map(option => ({ ...option, id: String(option.id) }))
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
  current: Record<string, string>, patch: AgreementCustomFieldPatch
): Promise<Record<string, string>> => {
  const definitions = await readAgreementCustomFieldDefinitions(db, streamId)
  const result = await parseI18n(event, z.object({
    egcs_fc_customfields: agreementCustomFieldMergeSchema(definitions, current)
  }), { egcs_fc_customfields: patch })
  return result.egcs_fc_customfields
}
