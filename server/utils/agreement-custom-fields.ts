import { z } from 'zod'
import type { Kysely, Selectable } from 'kysely'
import type { H3Event } from 'h3'
import type { Database } from '~~/shared/types/database'
import { agreementCustomFieldMergeSchema, type AgreementCustomFieldPatch, type AgreementCustomFieldValues, type AssignedAgencyCustomFieldDefinition } from '~~/shared/types/schemas/agreement-custom-fields'
import { assertAgreementCurrency } from './agreement-currency'
import { parseI18n } from './api-validate'
import { throwApiError } from './api-errors'
import { readAssignedAgencyCustomFieldDefinitions } from '../database/stream-custom-field-definitions'

export { readAgreementCustomFieldSections, readAssignedAgencyCustomFieldDefinitions } from '../database/stream-custom-field-definitions'

type ScalarCustomFieldValues = Selectable<Database['Funding_Case_Agreement_Profile']>['egcs_fc_customfields']

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
 * @param currency - Native denomination of the owning Agreement.
 * @param target - Record type receiving the answers.
 */
export const mergeAgreementCustomFields = async (
  event: H3Event, db: Kysely<Database>, streamId: string,
  current: ScalarCustomFieldValues, patch: AgreementCustomFieldPatch, currency: string,
  target: 'agreement' | 'activity' = 'agreement'
): Promise<ScalarCustomFieldValues> => {
  const definitions = await readAssignedAgencyCustomFieldDefinitions(db, streamId, target)
  const scalarFields = agreementCustomFieldMergeSchema(definitions, current, { currency }).transform((values, ctx) => {
    const result: ScalarCustomFieldValues = {}
    for (const [id, value] of Object.entries(values)) {
      if (typeof value === 'object' && 'rows' in value) {
        ctx.addIssue({ code: 'custom', path: [id], message: 'validation.invalid_selection' })
      } else result[id] = value
    }
    return result
  })
  const result = await parseI18n(event, z.object({
    egcs_fc_customfields: scalarFields
  }), { egcs_fc_customfields: patch })
  return result.egcs_fc_customfields
}

export const validateActivityCustomFieldWrite = async (
  event: H3Event, db: Kysely<Database>, agreementId: string, streamId: string,
  current: ScalarCustomFieldValues, patch: AgreementCustomFieldPatch
) => await mergeAgreementCustomFields(event, db, streamId, current, patch, await assertAgreementCurrency(event, db, agreementId), 'activity')

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
