import { z } from 'zod'
import type { Kysely } from 'kysely'
import type { H3Event } from 'h3'
import type { Database, StreamFieldAssignmentTarget } from '~~/shared/types/database'
import { agreementCustomFieldMergeSchema, type AgreementCustomFieldPatch, type AgreementCustomFieldValues, type AssignedAgencyCustomFieldDefinition } from '~~/shared/types/schemas/agreement-custom-fields'
import { parseI18n } from './api-validate'
import { throwApiError } from './api-errors'
import { readAssignedAgencyCustomFieldDefinitions } from '../database/stream-custom-field-definitions'

export { readAgreementCustomFieldSections, readAssignedAgencyCustomFieldDefinitions } from '../database/stream-custom-field-definitions'

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
