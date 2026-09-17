import { z } from 'zod'
import { PositivePostgresBigintIdSchema } from './common'

const Label = z.string({ error: 'validation.required' }).trim().min(1, { error: 'validation.required' })
const DisplayOrder = z.number().int().nonnegative().max(2147483647, { error: 'validation.custom_field_display_order_max' })
const CategoryLabel = z.preprocess(
  value => typeof value === 'string' && value.trim() === '' ? null : value,
  Label.nullable()
)
export const AgreementCustomFieldValuesSchema = z.record(
  PositivePostgresBigintIdSchema,
  z.union([z.string(), z.number({ error: 'validation.custom_field_number' }), z.array(PositivePostgresBigintIdSchema), z.null()], { error: 'validation.invalid_selection' })
)
export const StreamFieldSectionCreateSchema = z.object({
  egcs_tp_name_en: Label,
  egcs_tp_name_fr: Label,
  egcs_tp_displayorder: DisplayOrder.default(0)
})
export const StreamFieldSectionPatchSchema = StreamFieldSectionCreateSchema.extend({
  egcs_tp_displayorder: StreamFieldSectionCreateSchema.shape.egcs_tp_displayorder.removeDefault()
}).partial()
export type AgreementCustomFieldSection = z.infer<typeof StreamFieldSectionCreateSchema> & { id: string }
export const StreamFieldBaseSchema = z.object({
  egcs_tp_section: PositivePostgresBigintIdSchema,
  egcs_tp_name_en: Label,
  egcs_tp_name_fr: Label,
  egcs_tp_kind: z.enum(['text', 'number', 'relational']),
  egcs_tp_multiple: z.boolean().default(false),
  egcs_tp_presentation: z.enum(['single_line', 'multiline']).default('single_line'),
  egcs_tp_required: z.boolean().default(false),
  egcs_tp_discriminator: z.boolean().default(false),
  egcs_tp_active: z.boolean().default(true),
  egcs_tp_displayorder: DisplayOrder.default(0)
})
export const StreamFieldCreateSchema = StreamFieldBaseSchema.superRefine((value, ctx) => {
  if (value.egcs_tp_multiple && value.egcs_tp_kind !== 'relational') {
    ctx.addIssue({ code: 'custom', path: ['egcs_tp_multiple'], message: 'validation.invalid_selection' })
  }
  if ((value.egcs_tp_discriminator && value.egcs_tp_kind !== 'relational') || (value.egcs_tp_kind !== 'text' && value.egcs_tp_presentation !== 'single_line')) {
    ctx.addIssue({ code: 'custom', path: ['egcs_tp_kind'], message: 'validation.invalid_selection' })
  }
})
export const StreamFieldPatchSchema = StreamFieldBaseSchema.extend({
  egcs_tp_multiple: StreamFieldBaseSchema.shape.egcs_tp_multiple.removeDefault(),
  egcs_tp_presentation: StreamFieldBaseSchema.shape.egcs_tp_presentation.removeDefault(),
  egcs_tp_required: StreamFieldBaseSchema.shape.egcs_tp_required.removeDefault(),
  egcs_tp_discriminator: StreamFieldBaseSchema.shape.egcs_tp_discriminator.removeDefault(),
  egcs_tp_active: StreamFieldBaseSchema.shape.egcs_tp_active.removeDefault(),
  egcs_tp_displayorder: StreamFieldBaseSchema.shape.egcs_tp_displayorder.removeDefault()
}).partial()
export const StreamFieldOptionBaseSchema = z.object({
  egcs_tp_name_en: Label,
  egcs_tp_name_fr: Label,
  egcs_tp_category_en: CategoryLabel.default(null),
  egcs_tp_category_fr: CategoryLabel.default(null),
  egcs_tp_active: z.boolean().default(true),
  egcs_tp_displayorder: DisplayOrder.default(0)
})
export const StreamFieldOptionCreateSchema = StreamFieldOptionBaseSchema.refine(
  value => (value.egcs_tp_category_en === null) === (value.egcs_tp_category_fr === null),
  { error: 'validation.required', path: ['egcs_tp_category_fr'] }
)
export const StreamFieldOptionPatchSchema = StreamFieldOptionBaseSchema.extend({
  egcs_tp_category_en: StreamFieldOptionBaseSchema.shape.egcs_tp_category_en.removeDefault(),
  egcs_tp_category_fr: StreamFieldOptionBaseSchema.shape.egcs_tp_category_fr.removeDefault(),
  egcs_tp_active: StreamFieldOptionBaseSchema.shape.egcs_tp_active.removeDefault(),
  egcs_tp_displayorder: StreamFieldOptionBaseSchema.shape.egcs_tp_displayorder.removeDefault()
}).partial()
export type AgreementCustomFieldValues = Record<string, string | number | string[]>

export const customFieldOptionIds = (value: string | number | string[] | null | undefined): string[] =>
  Array.isArray(value) ? value : typeof value === 'string' && value.trim() ? [value] : []

export const customFieldHasValue = (value: string | number | string[] | null | undefined): boolean =>
  Array.isArray(value) ? value.length > 0 : typeof value === 'string' ? value.trim().length > 0 : typeof value === 'number'

export type AgreementCustomFieldPatch = z.infer<typeof AgreementCustomFieldValuesSchema>
export type AgreementCustomFieldDefinition = z.infer<typeof StreamFieldCreateSchema> & {
  id: string
  section?: AgreementCustomFieldSection
  options: Array<z.infer<typeof StreamFieldOptionCreateSchema> & { id: string }>
}

/**
 * Validates the merged record, preserving formatting and unchanged retired selections.
 * @returns A schema producing merged canonical values.
 * @param definitions - Authoritative stream definitions.
 * @param current - Stored Agreement values.
 */
export const agreementCustomFieldMergeSchema = (
  definitions: AgreementCustomFieldDefinition[],
  current: AgreementCustomFieldValues
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
    const blank = supplied === null || (typeof supplied === 'string' && supplied.trim() === '')
      || (field.egcs_tp_kind === 'relational' && Array.isArray(supplied) && supplied.length === 0)
    if (blank) {
      Reflect.deleteProperty(merged, id)
      continue
    }
    const unchanged = field.egcs_tp_kind === 'relational'
      ? JSON.stringify([...customFieldOptionIds(supplied)].sort()) === JSON.stringify([...customFieldOptionIds(current[id])].sort())
      : supplied === current[id]
    if (!field.egcs_tp_active && !unchanged) {
      issue(id, 'validation.custom_field_inactive')
      continue
    }
    if (field.egcs_tp_kind === 'text') {
      if (typeof supplied !== 'string') issue(id, 'validation.invalid_selection')
      else if (field.egcs_tp_presentation === 'single_line' && /[\r\n\u2028\u2029]/u.test(supplied)) issue(id, 'validation.custom_field_single_line')
      else merged[id] = supplied
    } else if (field.egcs_tp_kind === 'number') {
      if (typeof supplied !== 'number' || !Number.isFinite(supplied)) issue(id, 'validation.custom_field_number')
      else merged[id] = supplied
    } else {
      const parsed = z.array(PositivePostgresBigintIdSchema).safeParse(Array.isArray(supplied) ? supplied : [supplied])
      if (parsed.success && !field.egcs_tp_multiple && parsed.data.length > 1) {
        issue(id, 'validation.custom_field_single_selection')
        continue
      }
      const previous = customFieldOptionIds(current[id])
      if (!parsed.success || new Set(parsed.data).size !== parsed.data.length || parsed.data.some(optionId => {
        const option = field.options.find(item => item.id === optionId)
        return !option || (!option.egcs_tp_active && !previous.includes(optionId))
      })) issue(id, 'validation.invalid_selection')
      else merged[id] = parsed.data
    }
  }
  for (const field of definitions) {
    if (field.egcs_tp_active && field.egcs_tp_required && !customFieldHasValue(merged[field.id])) issue(field.id, 'validation.required')
  }
  return merged
})

export const CustomFieldConditionSchema = z.object({
  fieldId: PositivePostgresBigintIdSchema,
  optionIds: z.array(PositivePostgresBigintIdSchema).min(1, { error: 'validation.required' })
}).strict()
export const AgreementProfileConditionSchema = z.union([
  z.object({ source: z.enum(['agreement_subtype', 'holdback_basis']), optionIds: z.array(PositivePostgresBigintIdSchema).min(1, { error: 'validation.required' }) }).strict(),
  z.object({ source: z.literal('further_distribution'), value: z.boolean({ error: 'validation.required' }) }).strict(),
  z.object({ source: z.literal('proponent_type'), quantifier: z.enum(['any', 'all'], { error: 'validation.required' }), optionIds: z.array(PositivePostgresBigintIdSchema).min(1, { error: 'validation.required' }) }).strict()
])
export const WorkflowMemberConditionsSchema = z.array(z.union([CustomFieldConditionSchema, AgreementProfileConditionSchema])).superRefine((conditions, ctx) => {
  const seen = new Set<string>()
  conditions.forEach((condition, index) => {
    const key = 'fieldId' in condition ? condition.fieldId : condition.source
    if (seen.has(key)) ctx.addIssue({ code: 'custom', path: [index], message: 'validation.duplicate' })
    seen.add(key)
    if ('optionIds' in condition && new Set(condition.optionIds).size !== condition.optionIds.length) {
      ctx.addIssue({ code: 'custom', path: [index, 'optionIds'], message: 'validation.duplicate' })
    }
  })
})
export type CustomFieldCondition = z.infer<typeof CustomFieldConditionSchema>
export type AgreementProfileCondition = z.infer<typeof AgreementProfileConditionSchema>
export type WorkflowMemberCondition = z.infer<typeof WorkflowMemberConditionsSchema>[number]
export type AgreementRoutingValues = {
  agreement_subtype: string | null
  holdback_basis: string | null
  further_distribution: boolean
  proponent_type: Array<string | null>
}
/**
 * Stable identity shared by legacy and Agreement profile predicates.
 * @returns Stable field or profile source key.
 * @param condition - Saved workflow predicate.
 */
export const workflowConditionKey = (condition: WorkflowMemberCondition): string => 'fieldId' in condition ? condition.fieldId : condition.source
/**
 *
 * @returns Whether every predicate matches.
 * @param conditions - Predicates combined with AND.
 * @param values - Captured custom selections.
 * @param profile - Captured Agreement values.
 */
export const workflowConditionsMatch = (conditions: WorkflowMemberCondition[], values: AgreementCustomFieldValues, profile?: AgreementRoutingValues): boolean =>
  conditions.every(condition => {
    if ('fieldId' in condition) return customFieldOptionIds(values[condition.fieldId]).some(optionId => condition.optionIds.includes(optionId))
    if (!profile) return false
    if (condition.source === 'further_distribution') return profile.further_distribution === condition.value
    if (condition.source === 'proponent_type') {
      const matches = (id: string | null) => id !== null && condition.optionIds.includes(id)
      return profile.proponent_type.length > 0 && (condition.quantifier === 'all' ? profile.proponent_type.every(matches) : profile.proponent_type.some(matches))
    }
    const selected = profile[condition.source]
    return selected !== null && condition.optionIds.includes(selected)
  })
