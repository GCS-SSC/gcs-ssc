import { z } from 'zod'
import { MoneySchema } from './money'
import { isCanonicalMoney, type Money } from '../../utils/money'
import { sameCustomFieldAnswer } from '../../utils/agreement-custom-field-answers'
import { PositivePostgresBigintIdSchema } from './common'
import { CHECKLIST_RESULTS } from './checklist/checklist'

import {
  CustomFieldStructuredAnswerSchema, CustomFieldStructureSchema, customFieldDateSchema, customFieldDecimalPlaces as decimalPlaces,
  customFieldEmailSchema, validateStructuredCustomField
} from './custom-field-structure'
import type { CustomFieldStructuredAnswer } from './custom-field-structure'

export { CustomFieldStructuredAnswerSchema, CustomFieldStructureSchema, customFieldTableTotals } from './custom-field-structure'
export type { CustomFieldStructuredAnswer, CustomFieldStructure } from './custom-field-structure'

const Label = z.string({ error: 'validation.required' }).trim().min(1, { error: 'validation.required' })
  .refine(value => !value.includes('\u0000'), { error: 'validation.invalid_text_character' })
const DisplayOrder = z.number().int().nonnegative().max(2147483647, { error: 'validation.custom_field_display_order_max' })
const CategoryLabel = z.preprocess(
  value => typeof value === 'string' && value.trim() === '' ? null : value,
  Label.nullable()
)
export const AgreementCustomFieldValuesSchema = z.record(
  PositivePostgresBigintIdSchema,
  z.union([z.string(), z.number({ error: 'validation.custom_field_number' }), z.array(PositivePostgresBigintIdSchema), CustomFieldStructuredAnswerSchema, MoneySchema, z.null()], { error: 'validation.invalid_selection' })
)
export const StreamFieldSectionCreateSchema = z.object({
  egcs_tp_name_en: Label,
  egcs_tp_name_fr: Label,
  egcs_tp_displayorder: DisplayOrder.default(0),
  egcs_tp_beforeentity: z.boolean({ error: 'validation.invalid_selection' }).default(false)
})
export const StreamFieldSectionTargetSchema = z.enum(['agreement', 'claim', 'forecast'], { error: 'validation.invalid_selection' })
export const StreamFieldSectionPatchSchema = StreamFieldSectionCreateSchema.extend({
  egcs_tp_displayorder: StreamFieldSectionCreateSchema.shape.egcs_tp_displayorder.removeDefault(),
  egcs_tp_beforeentity: StreamFieldSectionCreateSchema.shape.egcs_tp_beforeentity.removeDefault()
}).partial()
export type AgreementCustomFieldSection = z.infer<typeof StreamFieldSectionCreateSchema> & { id: string }

export const AgencyCustomFieldBaseSchema = z.object({
  egcs_ay_name_en: Label,
  egcs_ay_name_fr: Label,
  egcs_ay_kind: z.enum(['text', 'number', 'relational', 'email', 'date', 'currency', 'table', 'repeating']),
  egcs_ay_multiple: z.boolean().default(false),
  egcs_ay_presentation: z.enum(['single_line', 'multiline', 'checkboxes']).default('single_line'),
  egcs_ay_discriminator: z.boolean().default(false),
  egcs_ay_structure: CustomFieldStructureSchema.nullish(),
  egcs_ay_minimum: z.number({ error: 'validation.custom_field_number' }).nullish(),
  egcs_ay_maximum: z.number({ error: 'validation.custom_field_number' }).nullish(),
  // The smallest positive JavaScript number is 5e-324.
  egcs_ay_decimalplaces: z.int({ error: 'validation.custom_field_decimal_places_config' })
    .min(0, { error: 'validation.custom_field_decimal_places_config' })
    .max(324, { error: 'validation.custom_field_decimal_places_config' }).nullish()
}).strict()

/**
 * Enforces kind-dependent Agency definition settings after schema defaults are applied.
 * @param value - Parsed definition settings.
 * @param ctx - Validation issue collector.
 */
const validateAgencyCustomField = (value: z.infer<typeof AgencyCustomFieldBaseSchema>, ctx: z.RefinementCtx) => {
  const { egcs_ay_minimum: minimum, egcs_ay_maximum: maximum } = value
  if (value.egcs_ay_kind !== 'number') {
    for (const path of ['egcs_ay_minimum', 'egcs_ay_maximum', 'egcs_ay_decimalplaces'] as const) {
      if (value[path] != null) ctx.addIssue({ code: 'custom', path: [path], message: 'validation.invalid_selection' })
    }
  } else if (minimum != null && maximum != null && minimum > maximum) {
    ctx.addIssue({ code: 'custom', path: ['egcs_ay_maximum'], message: 'validation.custom_field_range_order' })
  }
  if (value.egcs_ay_multiple && value.egcs_ay_kind !== 'relational') {
    ctx.addIssue({ code: 'custom', path: ['egcs_ay_multiple'], message: 'validation.invalid_selection' })
  }
  if (value.egcs_ay_discriminator && value.egcs_ay_kind !== 'relational') {
    ctx.addIssue({ code: 'custom', path: ['egcs_ay_discriminator'], message: 'validation.invalid_selection' })
  }
  if ((value.egcs_ay_presentation === 'multiline' && value.egcs_ay_kind !== 'text')
    || (value.egcs_ay_presentation === 'checkboxes' && (value.egcs_ay_kind !== 'relational' || !value.egcs_ay_multiple))) {
    ctx.addIssue({ code: 'custom', path: ['egcs_ay_presentation'], message: 'validation.invalid_selection' })
  }
  const needsStructure = value.egcs_ay_kind === 'table' || value.egcs_ay_kind === 'repeating'
  if (needsStructure ? value.egcs_ay_structure?.kind !== value.egcs_ay_kind : value.egcs_ay_structure != null) {
    ctx.addIssue({ code: 'custom', path: ['egcs_ay_structure'], message: 'validation.invalid_selection' })
  }
}

export const AgencyCustomFieldCreateSchema = AgencyCustomFieldBaseSchema.superRefine(validateAgencyCustomField)
  .superRefine((field, ctx) => {
    if (field.egcs_ay_structure?.kind !== 'repeating') return
    field.egcs_ay_structure.fields.forEach((child, index) => {
      if (child.minimum !== undefined && child.maximum !== undefined && child.minimum > child.maximum) return
      if (child.required && child.kind === 'number' && !customFieldNumberHasAnswer({
        egcs_ay_minimum: child.minimum,
        egcs_ay_maximum: child.maximum,
        egcs_ay_decimalplaces: child.decimalPlaces
      })) {
        ctx.addIssue({
          code: 'custom', path: ['egcs_ay_structure', 'fields', index, 'decimalPlaces'],
          message: 'validation.custom_field_number_unanswerable'
        })
      }
    })
  })
export const AgencyCustomFieldPatchSchema = AgencyCustomFieldBaseSchema.extend({
  egcs_ay_multiple: AgencyCustomFieldBaseSchema.shape.egcs_ay_multiple.removeDefault(),
  egcs_ay_presentation: AgencyCustomFieldBaseSchema.shape.egcs_ay_presentation.removeDefault(),
  egcs_ay_discriminator: AgencyCustomFieldBaseSchema.shape.egcs_ay_discriminator.removeDefault()
}).partial().strict()

export const AgencyCustomFieldOptionBaseSchema = z.object({
  egcs_ay_name_en: Label,
  egcs_ay_name_fr: Label,
  egcs_ay_category_en: CategoryLabel.default(null),
  egcs_ay_category_fr: CategoryLabel.default(null),
  egcs_ay_active: z.boolean().default(true),
  egcs_ay_displayorder: DisplayOrder.default(0)
}).strict()
const optionCategoriesMatch = (value: z.infer<typeof AgencyCustomFieldOptionBaseSchema>) =>
  (value.egcs_ay_category_en === null) === (value.egcs_ay_category_fr === null)
export const AgencyCustomFieldOptionCreateSchema = AgencyCustomFieldOptionBaseSchema.refine(
  optionCategoriesMatch, { error: 'validation.required', path: ['egcs_ay_category_fr'] }
)
export const AgencyCustomFieldOptionPatchSchema = AgencyCustomFieldOptionBaseSchema.extend({
  egcs_ay_category_en: AgencyCustomFieldOptionBaseSchema.shape.egcs_ay_category_en.removeDefault(),
  egcs_ay_category_fr: AgencyCustomFieldOptionBaseSchema.shape.egcs_ay_category_fr.removeDefault(),
  egcs_ay_active: AgencyCustomFieldOptionBaseSchema.shape.egcs_ay_active.removeDefault(),
  egcs_ay_displayorder: AgencyCustomFieldOptionBaseSchema.shape.egcs_ay_displayorder.removeDefault()
}).partial().strict()

export const StreamFieldAssignmentBaseSchema = z.object({
  egcs_tp_agencyfield: PositivePostgresBigintIdSchema,
  egcs_tp_section: PositivePostgresBigintIdSchema.nullable().default(null),
  egcs_tp_required: z.boolean().default(false),
  egcs_tp_active: z.boolean().default(true),
  egcs_tp_displayorder: DisplayOrder.default(0)
}).strict()
export const StreamFieldAssignmentCreateSchema = StreamFieldAssignmentBaseSchema
export const StreamFieldAssignmentPatchSchema = StreamFieldAssignmentBaseSchema.omit({ egcs_tp_agencyfield: true }).extend({
  egcs_tp_section: PositivePostgresBigintIdSchema.nullable().optional(),
  egcs_tp_required: z.boolean().optional(),
  egcs_tp_active: z.boolean().optional(),
  egcs_tp_displayorder: DisplayOrder.optional()
}).partial().strict()

/** Agency definition projected through one Stream's assignment for Agreement editing. */
export type AssignedAgencyCustomFieldDefinition = z.infer<typeof AgencyCustomFieldCreateSchema> & {
  id: string
  assignmentId: string
  egcs_tp_section: string | null
  egcs_tp_required: boolean
  egcs_tp_active: boolean
  egcs_tp_displayorder: number
  section?: AgreementCustomFieldSection
  options: Array<z.infer<typeof AgencyCustomFieldOptionCreateSchema> & { id: string }>
}

const distinctIds = (entries: { id: string }[]) => new Set(entries.map(entry => entry.id)).size === entries.length
const assignedClaimFieldSchema = AgencyCustomFieldBaseSchema.extend({
  id: PositivePostgresBigintIdSchema,
  assignmentId: PositivePostgresBigintIdSchema,
  egcs_tp_section: PositivePostgresBigintIdSchema.nullable(),
  section: StreamFieldSectionPatchSchema.required().extend({ id: PositivePostgresBigintIdSchema }).optional(),
  egcs_tp_required: z.boolean(),
  egcs_tp_active: z.boolean(),
  egcs_tp_displayorder: DisplayOrder,
  options: z.array(AgencyCustomFieldOptionBaseSchema.extend({
    id: PositivePostgresBigintIdSchema,
    egcs_ay_active: z.boolean()
  }).refine(optionCategoriesMatch)).refine(distinctIds)
}).superRefine((field, ctx) => {
  validateAgencyCustomField(field, ctx)
  if ((field.section?.id ?? null) !== field.egcs_tp_section) {
    ctx.addIssue({ code: 'custom', path: ['section'], message: 'validation.invalid_selection' })
  }
  if (field.egcs_ay_kind !== 'relational' && field.options.length > 0) {
    ctx.addIssue({ code: 'custom', path: ['options'], message: 'validation.invalid_selection' })
  }
})

export const PersistedClaimCustomFieldDefinitionsSchema = z.array(assignedClaimFieldSchema).refine(distinctIds)
  .refine(fields => new Set(fields.map(field => field.assignmentId)).size === fields.length)

const ClaimCustomFieldScalarEvidenceSchema = z.union([
  z.string(), z.number(), z.array(z.object({ en: z.string(), fr: z.string() })), MoneySchema, z.null()
])
const ClaimCustomFieldRowsEvidenceSchema = z.object({
  kind: z.enum(['table', 'repeating']).optional(),
  rows: z.array(z.object({
    id: z.string().optional(),
    cells: z.array(z.object({
      labelEn: z.string(),
      labelFr: z.string(),
      format: z.literal('decimal').optional(),
      value: ClaimCustomFieldScalarEvidenceSchema
    }))
  }))
})

export const ClaimCustomFieldSnapshotSchema = z.array(z.object({
  key: PositivePostgresBigintIdSchema,
  labelEn: z.string(),
  labelFr: z.string(),
  value: z.union([ClaimCustomFieldScalarEvidenceSchema, ClaimCustomFieldRowsEvidenceSchema])
}))

export type ClaimCustomFieldSnapshot = z.infer<typeof ClaimCustomFieldSnapshotSchema>

/** Agency-owned definition used by portable Workflow catalog authoring. */
export type AgencyCustomFieldDefinition = z.infer<typeof AgencyCustomFieldCreateSchema> & {
  id: string
  options: Array<z.infer<typeof AgencyCustomFieldOptionCreateSchema> & { id: string }>
}

export type ScalarCustomFieldValue = string | number | string[] | Money
export type CustomFieldValue = ScalarCustomFieldValue | CustomFieldStructuredAnswer
export type AgreementCustomFieldValues = Record<string, CustomFieldValue>

/**
 * Reads canonical choice IDs without interpreting scalar or structured answers.
 * @param value - Stored choice or absent answer.
 * @returns Selected IDs.
 */
export const customFieldOptionIds = (value: CustomFieldValue | null | undefined): string[] => {
  if (value === null || value === undefined) return []
  if (!Array.isArray(value)) throw new TypeError('Relational custom-field values must be option-ID arrays')
  return value
}

/**
 * @param value - Stored or cleared answer.
 * @returns Whether the answer has content.
 */
export const customFieldHasValue = (value: CustomFieldValue | null | undefined): boolean => {
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'number') return true
  return isCanonicalMoney(value) || Boolean(value && 'rows' in value && value.rows.length)
}

/**
 * Checks whether an active numeric definition admits a finite answer at its configured precision.
 * @param definition - Numeric bounds and decimal places.
 * @returns Whether at least one allowed answer exists.
 */
export const customFieldNumberHasAnswer = (
  definition: Pick<AssignedAgencyCustomFieldDefinition, 'egcs_ay_minimum' | 'egcs_ay_maximum' | 'egcs_ay_decimalplaces'>
): boolean => {
  const { egcs_ay_minimum: minimum, egcs_ay_maximum: maximum, egcs_ay_decimalplaces: places } = definition
  if (minimum == null || maximum == null) return true
  if (minimum > maximum) return false
  if (places == null || decimalPlaces(minimum) <= places || decimalPlaces(maximum) <= places) return true

  // Scale the canonical decimal digits exactly to avoid binary rounding and overflow.
  const [coefficient = '0'] = String(minimum).split('e')
  const digits = BigInt(coefficient.replace('.', ''))
  const divisor = BigInt(10) ** BigInt(decimalPlaces(minimum) - places)
  const roundedUp = digits / divisor + (digits % divisor > BigInt(0) ? BigInt(1) : BigInt(0))
  const candidate = Number(`${roundedUp}e-${places}`)
  return candidate >= minimum && candidate <= maximum && decimalPlaces(candidate) <= places
}

export type AgreementCustomFieldPatch = z.infer<typeof AgreementCustomFieldValuesSchema>
/**
 * Validates the merged record, preserving formatting and unchanged retired selections.
 * @returns A schema producing merged canonical values.
 * @param definitions - Authoritative stream definitions.
 * @param current - Stored values.
 * @param options - Required answer validation settings.
 * @param options.requireAnswers - Validate that required fields have answers.
 * @param options.labelRequiredAnswers - Include the bilingual field label in required-answer errors.
 * @param options.currency - Owning Agreement denomination, when known.
 */
export const agreementCustomFieldMergeSchema = (
  definitions: AssignedAgencyCustomFieldDefinition[],
  current: AgreementCustomFieldValues,
  { requireAnswers = true, labelRequiredAnswers = false, currency }: { requireAnswers?: boolean; labelRequiredAnswers?: boolean; currency?: string } = {}
) => AgreementCustomFieldValuesSchema.transform((patch, ctx): AgreementCustomFieldValues => {
  const merged = { ...current }
  const fields = new Map(definitions.map(field => [field.id, field]))
  const issue = (id: string, message: string) => ctx.addIssue({ code: 'custom', path: [id], message })
  for (const [id, supplied] of Object.entries(patch)) {
    const field = fields.get(id)
    if (!field) {
      issue(id, 'validation.invalid_selection')
      continue
    }
    const kind = field.egcs_ay_kind
    const active = field.egcs_tp_active
    const blank = supplied === null || (kind !== 'currency' && typeof supplied === 'string' && supplied.trim() === '')
      || (kind === 'relational' && Array.isArray(supplied) && supplied.length === 0)
      || ((kind === 'table' || kind === 'repeating') && typeof supplied === 'object' && !Array.isArray(supplied) && 'rows' in supplied && supplied.rows.length === 0)
    if (blank) {
      Reflect.deleteProperty(merged, id)
      continue
    }
    if (kind === 'relational' && !Array.isArray(supplied)) {
      issue(id, 'validation.invalid_selection')
      continue
    }
    const previousValue = current[id]
    if (kind === 'relational' && previousValue !== undefined && !Array.isArray(previousValue)) {
      issue(id, 'validation.invalid_selection')
      continue
    }
    const unchanged = sameCustomFieldAnswer(supplied, previousValue)
    if (!active && !unchanged) {
      issue(id, 'validation.custom_field_inactive')
      continue
    }
    if (kind === 'table' || kind === 'repeating') {
      if (!field.egcs_ay_structure || typeof supplied !== 'object' || Array.isArray(supplied) || !('rows' in supplied)) issue(id, 'validation.invalid_selection')
      else {
        validateStructuredCustomField(field.egcs_ay_structure, supplied, requireAnswers, (path, message, missing) => {
          if (labelRequiredAnswers && missing) {
            ctx.addIssue({
              code: 'custom', path: [id, ...path],
              message: kind === 'table' ? 'validation.custom_field_named_row_required' : 'validation.custom_field_named_entry_required',
              params: {
                row: missing.row, field_en: missing.labelEn, field_fr: missing.labelFr,
                group_en: field.egcs_ay_name_en, group_fr: field.egcs_ay_name_fr
              }
            })
          } else ctx.addIssue({ code: 'custom', path: [id, ...path], message })
        }, currency)
        merged[id] = supplied
      }
    } else if (kind === 'currency') {
      if (!isCanonicalMoney(supplied)) issue(id, 'validation.invalid_number')
      else if (currency && supplied.currency !== currency.toUpperCase()) issue(id, 'validation.invalid_selection')
      else merged[id] = supplied
    } else if (kind === 'email' || kind === 'date') {
      const parsed = (kind === 'email' ? customFieldEmailSchema : customFieldDateSchema).safeParse(supplied)
      if (!parsed.success) issue(id, kind === 'email' ? 'validation.custom_field_email' : 'validation.custom_field_date')
      else merged[id] = parsed.data
    } else if (kind === 'text') {
      if (typeof supplied !== 'string') issue(id, 'validation.invalid_selection')
      else if (field.egcs_ay_presentation === 'single_line' && /[\r\n\u2028\u2029]/u.test(supplied)) issue(id, 'validation.custom_field_single_line')
      else merged[id] = supplied
    } else if (kind === 'number') {
      if (typeof supplied !== 'number' || !Number.isFinite(supplied)) issue(id, 'validation.custom_field_number')
      else if (field.egcs_ay_decimalplaces != null && decimalPlaces(supplied) > field.egcs_ay_decimalplaces) {
        ctx.addIssue({
          code: 'custom', path: [id],
          message: field.egcs_ay_decimalplaces === 0 ? 'validation.custom_field_whole_number' : 'validation.custom_field_decimal_places',
          params: { places: field.egcs_ay_decimalplaces }
        })
      } else if (field.egcs_ay_minimum != null && supplied < field.egcs_ay_minimum) {
        ctx.addIssue({ code: 'custom', path: [id], message: 'validation.custom_field_minimum', params: { minimum: field.egcs_ay_minimum } })
      } else if (field.egcs_ay_maximum != null && supplied > field.egcs_ay_maximum) {
        ctx.addIssue({ code: 'custom', path: [id], message: 'validation.custom_field_maximum', params: { maximum: field.egcs_ay_maximum } })
      } else merged[id] = supplied
    } else {
      const parsed = z.array(PositivePostgresBigintIdSchema).safeParse(supplied)
      if (parsed.success && !field.egcs_ay_multiple && parsed.data.length > 1) {
        issue(id, 'validation.custom_field_single_selection')
        continue
      }
      const previous = customFieldOptionIds(current[id])
      if (!parsed.success || new Set(parsed.data).size !== parsed.data.length || parsed.data.some(optionId => {
        const option = field.options.find(item => item.id === optionId)
        return !option || (!option.egcs_ay_active && !previous.includes(optionId))
      })) issue(id, 'validation.invalid_selection')
      else merged[id] = parsed.data
    }
  }
  for (const field of definitions) {
    if (field.egcs_ay_kind === 'relational' && merged[field.id] !== undefined && !Array.isArray(merged[field.id])) issue(field.id, 'validation.invalid_selection')
    if (!requireAnswers || !field.egcs_tp_active || !field.egcs_tp_required || customFieldHasValue(merged[field.id])) continue
    if (labelRequiredAnswers) {
      ctx.addIssue({
        code: 'custom', path: [field.id], message: 'validation.custom_field_named_required',
        params: { field_en: field.egcs_ay_name_en, field_fr: field.egcs_ay_name_fr }
      })
    } else issue(field.id, 'validation.required')
  }
  return merged
})

export const CustomFieldConditionSchema = z.object({
  fieldId: PositivePostgresBigintIdSchema,
  optionIds: z.array(PositivePostgresBigintIdSchema).min(1, { error: 'validation.required' })
}).strict()
export const JV_WORKFLOW_BOOLEAN_SOURCES = ['jv_fiscal_eligible', 'jv_payment_final', 'jv_rationale_present'] as const
export const AgreementProfileConditionSchema = z.union([
  z.object({ source: z.enum(JV_WORKFLOW_BOOLEAN_SOURCES), value: z.boolean({ error: 'validation.required' }) }).strict(),
  z.object({ source: z.literal('agreement_subtype'), optionIds: z.array(PositivePostgresBigintIdSchema).min(1, { error: 'validation.required' }) }).strict(),
  z.object({ source: z.literal('amendment_type'), optionIds: z.array(PositivePostgresBigintIdSchema).min(1, { error: 'validation.required' }) }).strict(),
  z.object({ source: z.literal('amendment_subtype'), optionIds: z.array(PositivePostgresBigintIdSchema).min(1, { error: 'validation.required' }) }).strict(),
  z.object({ source: z.literal('further_distribution'), value: z.boolean({ error: 'validation.required' }) }).strict(),
  z.object({ source: z.literal('recipient_subtype'), quantifier: z.enum(['any', 'all'], { error: 'validation.required' }), optionIds: z.array(PositivePostgresBigintIdSchema).min(1, { error: 'validation.required' }) }).strict()
])
const resultConditionReference = {
  workflowMemberId: PositivePostgresBigintIdSchema,
  nestedMemberId: PositivePostgresBigintIdSchema
}
export const WORKFLOW_SCORE_OPERATORS = ['eq', 'lt', 'lte', 'gt', 'gte'] as const
export const WorkflowResultConditionSchema = z.discriminatedUnion('source', [
  z.strictObject({
    ...resultConditionReference,
    source: z.literal('assessment_score'),
    operator: z.enum(WORKFLOW_SCORE_OPERATORS, { error: 'validation.required' }),
    value: z.number({ error: 'validation.required' })
  }),
  z.strictObject({
    ...resultConditionReference,
    source: z.literal('checklist_result'),
    values: z.array(z.enum(CHECKLIST_RESULTS)).min(1, { error: 'validation.required' })
  }),
  z.strictObject({
    ...resultConditionReference,
    source: z.literal('recommendation_result'),
    value: z.boolean({ error: 'validation.required' })
  })
])
export type WorkflowResultCondition = z.infer<typeof WorkflowResultConditionSchema>

const WorkflowStartConditionSchema = z.union([CustomFieldConditionSchema, AgreementProfileConditionSchema])
const WorkflowMemberConditionSchema = z.unknown().transform((condition, ctx) => {
  const source = typeof condition === 'object' && condition !== null && 'source' in condition ? condition.source : undefined
  const isResult = source === 'assessment_score' || source === 'checklist_result' || source === 'recommendation_result'
  const parsed = (isResult ? WorkflowResultConditionSchema : WorkflowStartConditionSchema).safeParse(condition)
  if (parsed.success) return parsed.data
  for (const issue of parsed.error.issues) ctx.addIssue({ ...issue })
  return z.NEVER
})

export const WorkflowMemberConditionsSchema = z.array(WorkflowMemberConditionSchema).superRefine((conditions, ctx) => {
  const seen = new Set<string>()
  conditions.forEach((condition, index) => {
    const key = workflowConditionKey(condition)
    if (seen.has(key)) ctx.addIssue({ code: 'custom', path: [index], message: 'validation.duplicate' })
    seen.add(key)
    if ('optionIds' in condition && new Set(condition.optionIds).size !== condition.optionIds.length) {
      ctx.addIssue({ code: 'custom', path: [index, 'optionIds'], message: 'validation.duplicate' })
    }
    if ('values' in condition && new Set(condition.values).size !== condition.values.length) {
      ctx.addIssue({ code: 'custom', path: [index, 'values'], message: 'validation.duplicate' })
    }
  })
})
export type CustomFieldCondition = z.infer<typeof CustomFieldConditionSchema>
export type AgreementProfileCondition = z.infer<typeof AgreementProfileConditionSchema>
export type WorkflowMemberCondition = z.infer<typeof WorkflowMemberConditionsSchema>[number]
export type WorkflowStartCondition = Exclude<WorkflowMemberCondition, WorkflowResultCondition>

/**
 * @param condition - Authored workflow predicate.
 * @returns Whether the predicate references an earlier workflow result.
 */
export const isWorkflowResultCondition = (condition: WorkflowMemberCondition): condition is WorkflowResultCondition =>
  'workflowMemberId' in condition
export type AgreementRoutingValues = {
  amendment_type?: string[]
  amendment_subtype?: string[]
  jv_fiscal_eligible?: boolean
  jv_payment_final?: boolean
  jv_rationale_present?: boolean
  agreement_subtype: string | null
  further_distribution: boolean
  recipient_subtype: Array<string | null>
}
/**
 * Stable identity shared by legacy and Agreement profile predicates.
 * @returns Stable field or profile source key.
 * @param condition - Saved workflow predicate.
 */
export const workflowConditionKey = (condition: WorkflowMemberCondition): string => {
  if ('fieldId' in condition) return condition.fieldId
  if (!isWorkflowResultCondition(condition)) return condition.source
  const reference = `${condition.source}:${condition.workflowMemberId}:${condition.nestedMemberId}`
  return condition.source === 'assessment_score' ? `${reference}:${condition.operator}` : reference
}
/**
 *
 * @returns Whether every predicate matches.
 * @param conditions - Predicates combined with AND.
 * @param values - Captured custom selections.
 * @param profile - Captured Agreement values.
 */
export const workflowConditionsMatch = (conditions: WorkflowMemberCondition[], values: AgreementCustomFieldValues, profile?: Partial<AgreementRoutingValues>): boolean =>
  conditions.every(condition => {
    if (isWorkflowResultCondition(condition)) return false
    if ('fieldId' in condition) return customFieldOptionIds(values[condition.fieldId]).some(optionId => condition.optionIds.includes(optionId))
    if (!profile) return false
    if (condition.source === 'amendment_type' || condition.source === 'amendment_subtype') return (profile[condition.source] ?? []).some(optionId => condition.optionIds.includes(optionId))
    if ('value' in condition) return profile[condition.source] === condition.value
    if (condition.source === 'recipient_subtype') {
      const matches = (id: string | null) => id !== null && condition.optionIds.includes(id)
      const recipients = profile.recipient_subtype ?? []
      return recipients.length > 0 && (condition.quantifier === 'all' ? recipients.every(matches) : recipients.some(matches))
    }
    const selected = profile[condition.source]
    return typeof selected === 'string' && condition.optionIds.includes(selected)
  })
