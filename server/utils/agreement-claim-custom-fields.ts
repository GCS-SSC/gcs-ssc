import { createError, type H3Event } from 'h3'
import { sql, type Kysely } from 'kysely'
import { readAssignedAgencyCustomFieldDefinitions } from '../database/stream-custom-field-definitions'
import { useEvent } from 'nitropack/runtime'
import { z } from 'zod'
import { changedCustomFieldAnswers, sameCustomFieldAnswer } from '~~/shared/utils/agreement-custom-field-answers'
import type { FundingCaseAgreementClaimPatch } from '~~/shared/types/schemas/funding-case-agreement'
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
import { resolveValidationDetails, throwApiError } from './api-errors'
import { parseI18n } from './api-validate'
import { resolveRequestLocale } from './request-locale'

/**
 * Parses stored live or pinned financial field definitions before use.
 * @param stored - Untrusted database projection or JSON pin.
 * @param event - Request when the caller already has it.
 * @param target - Financial target used for localized errors.
 * @returns Validated definitions in their saved order.
 */
export const parsePersistedClaimCustomFieldDefinitions = async (stored: unknown, event?: H3Event, target: 'claim' | 'forecast' = 'claim') => {
  const parsed = PersistedClaimCustomFieldDefinitionsSchema.safeParse(stored)
  if (parsed.success) return parsed.data

  const code = `${target.toUpperCase()}_CUSTOM_FIELD_DEFINITIONS_INVALID`
  const key = `apiErrors.agreement.${target}_custom_field_definitions_invalid`
  if (!event) {
    try {
      event = useEvent()
    } catch { /* Seed and other database operations can run outside HTTP. */ }
  }
  if (event) await throwApiError(event, { statusCode: 500, code, key })
  const label = target === 'claim' ? 'Claim' : 'Forecast'
  const message = `Stored ${label} custom field definitions are invalid.`
  throw createError({ statusCode: 500, message, data: { code, message, translation: { key } } })
}

/**
 * Rejects a new financial field capture if a required field cannot be answered.
 * @param definitions - Active definitions proposed for the immutable capture.
 * @param event - Localized request, when running on behalf of an HTTP caller.
 * @param target - Financial target used for localized errors.
 */
export const assertClaimCustomFieldDefinitionsAnswerable = async (
  definitions: AssignedAgencyCustomFieldDefinition[], event?: H3Event, target: 'claim' | 'forecast' = 'claim'
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
  const code = `${target.toUpperCase()}_CUSTOM_FIELD_UNANSWERABLE`
  if (event) {
    await throwApiError(event, {
      statusCode: 409, code, key: `apiErrors.agreement.${target}_custom_field_unanswerable`,
      params: { field: resolveRequestLocale(event) === 'fr' ? field.egcs_ay_name_fr : field.egcs_ay_name_en }
    })
  }
  throw createError({
    statusCode: 409,
    data: { code },
    message: `Required ${target === 'claim' ? 'Claim' : 'Forecast'} custom field "${field.egcs_ay_name_en}" has no valid answer.`
  })
}

/**
 * Validates a financial answer write against the definitions captured at creation.
 * @param event - Localized request.
 * @param definitions - Pinned field definitions.
 * @param input - Answer write.
 * @param input.current - Existing answers when merging a partial write.
 * @param input.answers - Submitted answers.
 * @param input.requireAnswers - Whether required answers must be present.
 * @param input.path - Answer property in the request.
 * @param input.currency - Native denomination of the owning Agreement.
 * @param input.target - Financial target used for localized errors.
 * @returns Canonical answers.
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
    target?: 'claim' | 'forecast'
  }
) => {
  const parsed = await parsePersistedClaimCustomFieldDefinitions(definitions, event, input.target)
  const schema = claimCustomFieldAnswerSchema(parsed, input)
  const result = await parseI18n(event, schema, { [input.path]: input.answers })
  return result[input.path] ?? {}
}

/** Builds the same answer validation for draft writes, readiness, and execution.
 * @param definitions - Validated pinned definitions.
 * @param input - Answer validation options.
 * @param input.current - Existing draft answers, when merging a write.
 * @param input.requireAnswers - Whether required answers must be present.
 * @param input.path - Answer property in the request.
 * @param input.currency - Agreement currency.
 * @returns The path-aware answer schema.
 */
const claimCustomFieldAnswerSchema = (
  definitions: AssignedAgencyCustomFieldDefinition[],
  input: {
    current?: AgreementCustomFieldValues
    requireAnswers: boolean
    path: 'egcs_fc_customfields' | 'customFields'
    currency: string
  }
) => {
  const schema = agreementCustomFieldMergeSchema(definitions, input.current ?? {}, {
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
  return z.object({ [input.path]: schema })
}

/**
 * Checks required custom fields before a financial record advances.
 * @param event - Localized request.
 * @param db - Locked write transaction.
 * @param id - Record being advanced.
 * @param target - Financial target used for lookup and localized errors.
 */
export const assertClaimCustomFieldsComplete = async (event: H3Event, db: Kysely<Database>, id: string, target: 'claim' | 'forecast' = 'claim') => {
  const { schema, input } = await loadFinancialCustomFieldCompletionValidation(event, db, id, target)
  await parseI18n(event, schema, input)
}

/**
 * Presents any invalid or missing pinned financial answers in Completion readiness.
 * @param event - Localized request.
 * @param db - Authorized read snapshot.
 * @param id - Claim or Forecast ID.
 * @param target - Financial record kind.
 * @returns Validation details, or an empty list for complete answers.
 */
export const getFinancialCustomFieldCompletionDetails = async (
  event: H3Event, db: Kysely<Database>, id: string, target: 'claim' | 'forecast'
) => {
  const { schema, input } = await loadFinancialCustomFieldCompletionValidation(event, db, id, target)
  const result = await schema.safeParseAsync(input)
  return result.success ? [] : await resolveValidationDetails(event, result.error)
}

/**
 * Loads the pinned definitions and current answers for both Completion paths.
 * @param event - Localized request.
 * @param db - Read or write transaction.
 * @param id - Claim or Forecast ID.
 * @param target - Financial record kind.
 * @returns The schema and stored answer payload.
 */
const loadFinancialCustomFieldCompletionValidation = async (
  event: H3Event, db: Kysely<Database>, id: string, target: 'claim' | 'forecast'
) => {
  const claim = await db.selectFrom(target === 'claim' ? 'Funding_Case_Agreement_Claim' : 'Funding_Case_Agreement_Forecast')
    .select(['egcs_fc_customfields', 'egcs_fc_customfielddefinitions', 'egcs_fc_fundingagreement'])
    .where('id', '=', id).where('_deleted', '=', false).executeTakeFirstOrThrow()
  const currency = await assertAgreementCurrency(event, db, claim.egcs_fc_fundingagreement)
  const definitions = await parsePersistedClaimCustomFieldDefinitions(claim.egcs_fc_customfielddefinitions, event, target)
  const schema = claimCustomFieldAnswerSchema(definitions, {
    requireAnswers: true,
    currency,
    path: 'egcs_fc_customfields'
  })
  return { schema, input: { egcs_fc_customfields: claim.egcs_fc_customfields } }
}

/**
 * Captures Forecast questions at creation and validates answers supplied by an external receipt.
 * @param db - Authorized write transaction.
 * @param streamId - Forecast's funding stream.
 * @param receipt - Source receipt when creation is submission-linked.
 * @param receipt.event - Request that received the submission.
 * @param receipt.answers - Answers supplied by the source.
 * @param receipt.currency - Owning Agreement currency.
 * @param event - Request for native creation.
 * @returns Initial persisted Forecast definitions and answers.
 */
export const captureForecastCustomFields = async (
  db: Kysely<Database>, streamId: string,
  receipt?: { event: H3Event; answers?: AgreementCustomFieldPatch; currency: string },
  event?: H3Event
) => {
  const live = await readAssignedAgencyCustomFieldDefinitions(db, streamId, 'forecast')
  const definitions = (await parsePersistedClaimCustomFieldDefinitions(live, receipt?.event ?? event, 'forecast'))
    .filter(field => field.egcs_tp_active)
  await assertClaimCustomFieldDefinitionsAnswerable(definitions, receipt?.event ?? event, 'forecast')
  return {
    egcs_fc_customfielddefinitions: sql<AssignedAgencyCustomFieldDefinition[]>`${JSON.stringify(definitions)}::jsonb`,
    egcs_fc_customfields: receipt
      ? await validateClaimCustomFields(receipt.event, definitions, {
          target: 'forecast', answers: receipt.answers ?? {}, requireAnswers: true, path: 'customFields', currency: receipt.currency
        })
      : {}
  }
}

/**
 * Computes the answer update under the owning Agreement and target locks.
 * @param event - Localized request.
 * @param db - Authorized write transaction.
 * @param input - Target, pinned definitions, and submitted answer changes.
 * @param input.target - Claim or Forecast.
 * @param input.id - Target record identifier.
 * @param input.agreementId - Owning Agreement identifier.
 * @param input.definitions - Immutable field definitions.
 * @param input.current - Current canonical answers.
 * @param input.patch - Changes and original values supplied by the editor.
 * @returns New answers when there is an effective change.
 */
export const prepareFinancialCustomFieldPatch = async (
  event: H3Event, db: Kysely<Database>, input: {
    target: 'claim' | 'forecast'
    id: string
    agreementId: string
    definitions: unknown
    current: AgreementCustomFieldValues
    patch: Pick<FundingCaseAgreementClaimPatch, 'egcs_fc_customfields' | 'customFieldPrecondition'>
  }
) => {
  const { target, id, agreementId, definitions, current, patch } = input
  const { egcs_fc_customfields: changes, customFieldPrecondition } = patch
  if (changes === undefined) return undefined
  if (customFieldPrecondition) {
    const submission = await db.selectFrom('Funding_Case_Agreement_Submission').select('egcs_fc_revision')
      .where('egcs_fc_target', '=', target)
      .where('egcs_fc_result', '=', id)
      .where('_deleted', '=', false)
      .executeTakeFirst()
    if (customFieldPrecondition.submissionRevision !== (submission?.egcs_fc_revision ?? null)) {
      return await throwApiError(event, { statusCode: 409, code: 'SUBMISSION_STALE', key: 'submission.errors.stale' })
    }
  }
  const answers = await validateClaimCustomFields(event, definitions, {
    target, current, answers: changes, requireAnswers: false, path: 'egcs_fc_customfields',
    currency: await assertAgreementCurrency(event, db, agreementId)
  })
  const changedKeys = Object.keys(changedCustomFieldAnswers(current, answers))
  if (customFieldPrecondition && changedKeys.some(key =>
    !sameCustomFieldAnswer(current[key], customFieldPrecondition.previousAnswers[key])
  )) {
    return await throwApiError(event, {
      statusCode: 409, code: `${target.toUpperCase()}_ANSWERS_STALE`, key: `apiErrors.agreement.${target}_answers_stale`
    })
  }
  if (changedKeys.length === 0) return undefined

  // Keep saved ordering for equivalent selections when other answers change.
  return Object.fromEntries(Object.entries(answers).map(([key, answer]) => {
    const previous = current[key]
    return [key, previous !== undefined && sameCustomFieldAnswer(previous, answer) ? previous : answer]
  }))
}
