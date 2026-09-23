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

export const AgencyCustomFieldBaseSchema = z.object({
  egcs_ay_name_en: Label,
  egcs_ay_name_fr: Label,
  egcs_ay_kind: z.enum(['text', 'number', 'relational']),
  egcs_ay_multiple: z.boolean().default(false),
  egcs_ay_presentation: z.enum(['single_line', 'multiline']).default('single_line'),
  egcs_ay_discriminator: z.boolean().default(false)
}).strict()

/**
 * Enforces kind-dependent Agency definition settings after schema defaults are applied.
 * @param value - Parsed definition settings.
 * @param ctx - Validation issue collector.
 */
const validateAgencyCustomField = (value: z.infer<typeof AgencyCustomFieldBaseSchema>, ctx: z.RefinementCtx) => {
  if (value.egcs_ay_multiple && value.egcs_ay_kind !== 'relational') {
    ctx.addIssue({ code: 'custom', path: ['egcs_ay_multiple'], message: 'validation.invalid_selection' })
  }
  if (value.egcs_ay_discriminator && value.egcs_ay_kind !== 'relational') {
    ctx.addIssue({ code: 'custom', path: ['egcs_ay_discriminator'], message: 'validation.invalid_selection' })
  }
  if (value.egcs_ay_kind !== 'text' && value.egcs_ay_presentation !== 'single_line') {
    ctx.addIssue({ code: 'custom', path: ['egcs_ay_presentation'], message: 'validation.invalid_selection' })
  }
}

export const AgencyCustomFieldCreateSchema = AgencyCustomFieldBaseSchema.superRefine(validateAgencyCustomField)
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
export const AgencyCustomFieldOptionCreateSchema = AgencyCustomFieldOptionBaseSchema.refine(
  value => (value.egcs_ay_category_en === null) === (value.egcs_ay_category_fr === null),
  { error: 'validation.required', path: ['egcs_ay_category_fr'] }
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

/** Agency-owned definition used by portable Workflow catalog authoring. */
export type AgencyCustomFieldDefinition = z.infer<typeof AgencyCustomFieldCreateSchema> & {
  id: string
  options: Array<z.infer<typeof AgencyCustomFieldOptionCreateSchema> & { id: string }>
}

export type AgreementCustomFieldValues = Record<string, string | number | string[]>

export const customFieldOptionIds = (value: string | number | string[] | null | undefined): string[] =>
  Array.isArray(value) ? value : typeof value === 'string' && value.trim() ? [value] : []

export const customFieldHasValue = (value: string | number | string[] | null | undefined): boolean =>
  Array.isArray(value) ? value.length > 0 : typeof value === 'string' ? value.trim().length > 0 : typeof value === 'number'

export type AgreementCustomFieldPatch = z.infer<typeof AgreementCustomFieldValuesSchema>
/**
 * Validates the merged record, preserving formatting and unchanged retired selections.
 * @returns A schema producing merged canonical values.
 * @param definitions - Authoritative stream definitions.
 * @param current - Stored Agreement values.
 */
export const agreementCustomFieldMergeSchema = (
  definitions: AssignedAgencyCustomFieldDefinition[],
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
    const kind = field.egcs_ay_kind
    const active = field.egcs_tp_active
    const blank = supplied === null || (typeof supplied === 'string' && supplied.trim() === '')
      || (kind === 'relational' && Array.isArray(supplied) && supplied.length === 0)
    if (blank) {
      Reflect.deleteProperty(merged, id)
      continue
    }
    const unchanged = kind === 'relational'
      ? JSON.stringify([...customFieldOptionIds(supplied)].sort()) === JSON.stringify([...customFieldOptionIds(current[id])].sort())
      : supplied === current[id]
    if (!active && !unchanged) {
      issue(id, 'validation.custom_field_inactive')
      continue
    }
    if (kind === 'text') {
      if (typeof supplied !== 'string') issue(id, 'validation.invalid_selection')
      else if (field.egcs_ay_presentation === 'single_line' && /[\r\n\u2028\u2029]/u.test(supplied)) issue(id, 'validation.custom_field_single_line')
      else merged[id] = supplied
    } else if (kind === 'number') {
      if (typeof supplied !== 'number' || !Number.isFinite(supplied)) issue(id, 'validation.custom_field_number')
      else merged[id] = supplied
    } else {
      const parsed = z.array(PositivePostgresBigintIdSchema).safeParse(Array.isArray(supplied) ? supplied : [supplied])
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
    if (field.egcs_tp_active && field.egcs_tp_required && !customFieldHasValue(merged[field.id])) issue(field.id, 'validation.required')
  }
  return merged
})

export const CustomFieldConditionSchema = z.object({
  fieldId: PositivePostgresBigintIdSchema,
  optionIds: z.array(PositivePostgresBigintIdSchema).min(1, { error: 'validation.required' })
}).strict()
export const AgreementProfileConditionSchema = z.union([
  z.object({ source: z.literal('agreement_subtype'), optionIds: z.array(PositivePostgresBigintIdSchema).min(1, { error: 'validation.required' }) }).strict(),
  z.object({ source: z.literal('further_distribution'), value: z.boolean({ error: 'validation.required' }) }).strict(),
  z.object({ source: z.literal('recipient_subtype'), quantifier: z.enum(['any', 'all'], { error: 'validation.required' }), optionIds: z.array(PositivePostgresBigintIdSchema).min(1, { error: 'validation.required' }) }).strict()
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
  further_distribution: boolean
  recipient_subtype: Array<string | null>
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
    if (condition.source === 'recipient_subtype') {
      const matches = (id: string | null) => id !== null && condition.optionIds.includes(id)
      return profile.recipient_subtype.length > 0 && (condition.quantifier === 'all' ? profile.recipient_subtype.every(matches) : profile.recipient_subtype.some(matches))
    }
    const selected = profile[condition.source]
    return selected !== null && condition.optionIds.includes(selected)
  })
