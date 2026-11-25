import { createError, type H3Event } from 'h3'
import type { Kysely } from 'kysely'
import { z } from 'zod'
import type { Database } from '~~/shared/types/database'
import {
  agreementCustomFieldMergeSchema,
  customFieldNumberHasAnswer,
  type AgreementCustomFieldPatch,
  type AgreementCustomFieldValues,
  type AssignedAgencyCustomFieldDefinition
} from '~~/shared/types/schemas/agreement-custom-fields'
import { throwApiError } from './api-errors'
import { parseI18n } from './api-validate'
import { resolveRequestLocale } from './request-locale'

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
    (field.egcs_ay_kind === 'number' && !customFieldNumberHasAnswer(field))
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
 * @returns Canonical Claim answers.
 */
export const validateClaimCustomFields = async (
  event: H3Event,
  definitions: AssignedAgencyCustomFieldDefinition[],
  input: {
    current?: AgreementCustomFieldValues
    answers: AgreementCustomFieldPatch
    requireAnswers: boolean
    path: 'egcs_fc_customfields' | 'customFields'
  }
) => {
  const schema = agreementCustomFieldMergeSchema(definitions, input.current ?? {}, {
    requireAnswers: input.requireAnswers,
    labelRequiredAnswers: true
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
    .select(['egcs_fc_customfields', 'egcs_fc_customfielddefinitions'])
    .where('id', '=', claimId).where('_deleted', '=', false).executeTakeFirstOrThrow()
  await validateClaimCustomFields(event, claim.egcs_fc_customfielddefinitions, {
    answers: claim.egcs_fc_customfields,
    requireAnswers: true,
    path: 'egcs_fc_customfields'
  })
}
