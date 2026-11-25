import { z } from 'zod'
import type { Kysely, Selectable } from 'kysely'
import type { H3Event } from 'h3'
import type { Database } from '~~/shared/types/database'
import { agreementCustomFieldMergeSchema, type AgreementCustomFieldPatch, type AgreementCustomFieldValues, type AssignedAgencyCustomFieldDefinition } from '~~/shared/types/schemas/agreement-custom-fields'
import { assertAgreementCurrency } from './agreement-currency'
import { parseI18n } from './api-validate'
import { throwApiError } from './api-errors'
import { readAssignedAgencyCustomFieldDefinitions } from '../database/stream-custom-field-definitions'

export { readStreamCustomFieldSections, readAssignedAgencyCustomFieldDefinitions } from '../database/stream-custom-field-definitions'

type ScalarCustomFieldValues = Selectable<Database['Funding_Case_Agreement_Profile']>['egcs_fc_customfields']

/**
 * Reads the Stream's Activity fields for the owning workspace.
 * @param db - Current database connection.
 * @param streamId - Owning Stream identity.
 * @param scope - The Amendment workspace uses the original scalar field kinds.
 * @returns Applicable Activity field definitions.
 */
export const readActivityCustomFieldDefinitions = async (db: Kysely<Database>, streamId: string, scope: 'agreement' | 'amendment' = 'agreement') => {
  const definitions = await readAssignedAgencyCustomFieldDefinitions(db, streamId, 'activity')
  return scope === 'amendment'
    ? definitions.filter(field => ['text', 'number', 'relational'].includes(field.egcs_ay_kind))
    : definitions
}

/**
 * Applies scalar custom field validation to a patch.
 * @param event - Authorized request.
 * @param definitions - Available field definitions.
 * @param current - Stored values.
 * @param patch - Supplied changes.
 * @param currency - Native denomination when the workspace supports currency fields.
 * @returns Validated scalar values.
 */
const mergeScalarCustomFields = async (
  event: H3Event, definitions: AssignedAgencyCustomFieldDefinition[],
  current: ScalarCustomFieldValues, patch: AgreementCustomFieldPatch, currency?: string
): Promise<ScalarCustomFieldValues> => {
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

/**
 * Validates an Agreement custom field patch using the owning Stream's assignments.
 * @param event - Authorized request.
 * @param db - Current transaction or connection.
 * @param streamId - Owning Stream identity.
 * @param current - Stored values.
 * @param patch - Supplied changes.
 * @param currency - Native denomination of the Agreement.
 * @returns Validated scalar values.
 */
export const mergeAgreementCustomFields = async (
  event: H3Event, db: Kysely<Database>, streamId: string,
  current: ScalarCustomFieldValues, patch: AgreementCustomFieldPatch, currency: string
) => await mergeScalarCustomFields(event, await readAssignedAgencyCustomFieldDefinitions(db, streamId), current, patch, currency)

/**
 * Validates an Activity patch against the owning workspace's fields.
 * @param event - Authorized request.
 * @param db - Current database connection.
 * @param streamId - Owning Stream identity.
 * @param current - Stored values.
 * @param patch - Supplied changes.
 * @param agreementId - Native Agreement identity for writes outside an Amendment.
 * @returns Validated scalar values.
 */
export const validateActivityCustomFieldWrite = async (
  event: H3Event, db: Kysely<Database>, streamId: string,
  current: ScalarCustomFieldValues, patch: AgreementCustomFieldPatch, agreementId?: string
) => await mergeScalarCustomFields(
  event, await readActivityCustomFieldDefinitions(db, streamId, agreementId ? 'agreement' : 'amendment'),
  current, patch, agreementId ? await assertAgreementCurrency(event, db, agreementId) : undefined
)

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
