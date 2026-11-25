import { createError, type H3Event } from 'h3'
import type { Kysely } from 'kysely'
import { useEvent } from 'nitropack/runtime'
import { z } from 'zod'
import type { Database } from '~~/shared/types/database'
import {
  agreementCustomFieldMergeSchema,
  customFieldNumberHasAnswer,
  PersistedClaimCustomFieldDefinitionsSchema,
  type AgreementCustomFieldPatch,
  type AgreementCustomFieldValues,
  type AssignedAgencyCustomFieldDefinition
} from '~~/shared/types/schemas/agreement-custom-fields'
import { assertAgreementCurrency } from './agreement-currency'
import { throwApiError } from './api-errors'
import { parseI18n } from './api-validate'
import { resolveRequestLocale } from './request-locale'

/**
 * Parses stored live or pinned Claim definitions before they are used.
 * @param stored - Untrusted database projection or JSON pin.
 * @param event - Request when the caller already has it.
 * @returns Validated definitions in their saved order.
 */
export const parsePersistedClaimCustomFieldDefinitions = async (stored: unknown, event?: H3Event) => {
  const parsed = PersistedClaimCustomFieldDefinitionsSchema.safeParse(stored)
  if (parsed.success) return parsed.data

  const code = 'CLAIM_CUSTOM_FIELD_DEFINITIONS_INVALID'
  const key = 'apiErrors.agreement.claim_custom_field_definitions_invalid'
  if (!event) {
    try {
      event = useEvent()
    } catch { /* Seed and other database operations can run outside HTTP. */ }
  }
  if (event) await throwApiError(event, { statusCode: 500, code, key })
  const message = 'Stored Claim custom field definitions are invalid.'
  throw createError({ statusCode: 500, message, data: { code, message, translation: { key } } })
}

/**
 * Rejects a new Claim capture if a required field cannot be answered.
 * @param definitions - Active definitions proposed for the immutable capture.
 * @param event - Localized request, when running on behalf of an HTTP caller.
 */
export const assertClaimCustomFieldDefinitionsAnswerable = async (
  definitions: AssignedAgencyCustomFieldDefinition[], event?: H3Event
): Promise<void> => {
  const field = definitions.find(field => field.egcs_tp_required && (
    (field.egcs_ay_kind === 'relational' && !field.options.some(option => option.egcs_ay_active)) ||
    (field.egcs_ay_kind === 'number' && !customFieldNumberHasAnswer(field)) ||
    (field.egcs_ay_structure?.kind === 'repeating' && field.egcs_ay_structure.fields
      .some(child => child.required && (
        (child.kind === 'relational' && !child.options?.length) ||
        (child.kind === 'number' && !customFieldNumberHasAnswer({
          egcs_ay_minimum: child.minimum,
          egcs_ay_maximum: child.maximum,
          egcs_ay_decimalplaces: child.decimalPlaces
        }))
      )))
  ))
  if (!field) return
  const code = 'CLAIM_CUSTOM_FIELD_UNANSWERABLE'
  if (event) {
    await throwApiError(event, {
      statusCode: 409, code, key: 'apiErrors.agreement.claim_custom_field_unanswerable',
      params: { field: resolveRequestLocale(event) === 'fr' ? field.egcs_ay_name_fr : field.egcs_ay_name_en }
    })
  }
  throw createError({
    statusCode: 409,
    data: { code },
    message: `Required Claim custom field "${field.egcs_ay_name_en}" has no valid answer.`
  })
}

/**
 * Validates a Claim answer write against the definitions captured at creation.
 * @param event - Localized request.
 * @param definitions - Pinned field definitions.
 * @param input - Answer write.
 * @param input.current - Existing answers when merging a partial write.
 * @param input.answers - Submitted answers.
 * @param input.requireAnswers - Whether required answers must be present.
 * @param input.path - Answer property in the request.
 * @param input.currency - Native denomination of the owning Agreement.
 * @returns Canonical Claim answers.
 */
export const validateClaimCustomFields = async (
  event: H3Event,
  definitions: unknown,
  input: {
    current?: AgreementCustomFieldValues
    answers: AgreementCustomFieldPatch
    requireAnswers: boolean
    path: 'egcs_fc_customfields' | 'customFields'
    currency: string
  }
) => {
  const parsed = await parsePersistedClaimCustomFieldDefinitions(definitions, event)
  const schema = agreementCustomFieldMergeSchema(parsed, input.current ?? {}, {
    requireAnswers: input.requireAnswers,
    labelRequiredAnswers: true,
    currency: input.currency
  }).superRefine((values, ctx) => {
    for (const [id, value] of Object.entries(values)) {
      if (typeof value === 'string' && (value.includes('\0') || /\p{Surrogate}/u.test(value))) {
        ctx.addIssue({ code: 'custom', path: [id], message: 'validation.invalid_text_character' })
      }
    }
  })
  const result = await parseI18n(event, z.object({ [input.path]: schema }), { [input.path]: input.answers })
  return result[input.path] ?? {}
}

/**
 * Checks required custom fields before a Claim proceeds in its lifecycle.
 * @param event - Localized request.
 * @param db - Locked write transaction.
 * @param claimId - Claim being advanced.
 */
export const assertClaimCustomFieldsComplete = async (event: H3Event, db: Kysely<Database>, claimId: string) => {
  const claim = await db.selectFrom('Funding_Case_Agreement_Claim')
    .select(['egcs_fc_customfields', 'egcs_fc_customfielddefinitions', 'egcs_fc_fundingagreement'])
    .where('id', '=', claimId).where('_deleted', '=', false).executeTakeFirstOrThrow()
  await validateClaimCustomFields(event, claim.egcs_fc_customfielddefinitions, {
    answers: claim.egcs_fc_customfields,
    requireAnswers: true,
    currency: await assertAgreementCurrency(event, db, claim.egcs_fc_fundingagreement),
    path: 'egcs_fc_customfields'
  })
}
