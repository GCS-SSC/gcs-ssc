import { z } from 'zod'
import { PositivePostgresBigintIdSchema } from './common'

const Label = z.string({ error: 'validation.required' }).trim().min(1, { error: 'validation.required' })
export const AgreementCustomFieldValuesSchema = z.record(
  PositivePostgresBigintIdSchema,
  z.union([z.string(), z.number({ error: 'validation.custom_field_number' }), z.array(PositivePostgresBigintIdSchema), z.null()], { error: 'validation.invalid_selection' })
)
export const StreamFieldSectionCreateSchema = z.object({
  name_en: Label,
  name_fr: Label,
  display_order: z.number().int().nonnegative().default(0)
})
export const StreamFieldSectionPatchSchema = StreamFieldSectionCreateSchema.extend({
  display_order: StreamFieldSectionCreateSchema.shape.display_order.removeDefault()
}).partial()
export type AgreementCustomFieldSection = z.infer<typeof StreamFieldSectionCreateSchema> & { id: string }
export const StreamFieldBaseSchema = z.object({
  section_id: PositivePostgresBigintIdSchema,
  name_en: Label,
  name_fr: Label,
  kind: z.enum(['text', 'number', 'relational']),
  multiple: z.boolean().default(false),
  presentation: z.enum(['single_line', 'multiline']).default('single_line'),
  required: z.boolean().default(false),
  discriminator: z.boolean().default(false),
  active: z.boolean().default(true),
  display_order: z.number().int().nonnegative().default(0)
})
export const StreamFieldCreateSchema = StreamFieldBaseSchema.superRefine((value, ctx) => {
  if (value.multiple && value.kind !== 'relational') {
    ctx.addIssue({ code: 'custom', path: ['multiple'], message: 'validation.invalid_selection' })
  }
  if ((value.discriminator && value.kind !== 'relational') || (value.kind !== 'text' && value.presentation !== 'single_line')) {
    ctx.addIssue({ code: 'custom', path: ['kind'], message: 'validation.invalid_selection' })
  }
})
export const StreamFieldPatchSchema = StreamFieldBaseSchema.extend({
  multiple: StreamFieldBaseSchema.shape.multiple.removeDefault(),
  presentation: StreamFieldBaseSchema.shape.presentation.removeDefault(),
  required: StreamFieldBaseSchema.shape.required.removeDefault(),
  discriminator: StreamFieldBaseSchema.shape.discriminator.removeDefault(),
  active: StreamFieldBaseSchema.shape.active.removeDefault(),
  display_order: StreamFieldBaseSchema.shape.display_order.removeDefault()
}).partial()
export const StreamFieldOptionBaseSchema = z.object({
  name_en: Label,
  name_fr: Label,
  category_en: Label.nullable().default(null),
  category_fr: Label.nullable().default(null),
  active: z.boolean().default(true),
  display_order: z.number().int().nonnegative().default(0)
})
export const StreamFieldOptionCreateSchema = StreamFieldOptionBaseSchema.refine(
  value => (value.category_en === null) === (value.category_fr === null),
  { error: 'validation.required', path: ['category_fr'] }
)
export const StreamFieldOptionPatchSchema = StreamFieldOptionBaseSchema.extend({
  category_en: StreamFieldOptionBaseSchema.shape.category_en.removeDefault(),
  category_fr: StreamFieldOptionBaseSchema.shape.category_fr.removeDefault(),
  active: StreamFieldOptionBaseSchema.shape.active.removeDefault(),
  display_order: StreamFieldOptionBaseSchema.shape.display_order.removeDefault()
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
      || (field.kind === 'relational' && Array.isArray(supplied) && supplied.length === 0)
    if (blank) {
      Reflect.deleteProperty(merged, id)
      continue
    }
    const unchanged = field.kind === 'relational'
      ? JSON.stringify([...customFieldOptionIds(supplied)].sort()) === JSON.stringify([...customFieldOptionIds(current[id])].sort())
      : supplied === current[id]
    if (!field.active && !unchanged) {
      issue(id, 'validation.custom_field_inactive')
      continue
    }
    if (field.kind === 'text') {
      if (typeof supplied !== 'string') issue(id, 'validation.invalid_selection')
      else if (field.presentation === 'single_line' && /[\r\n\u2028\u2029]/u.test(supplied)) issue(id, 'validation.custom_field_single_line')
      else merged[id] = supplied
    } else if (field.kind === 'number') {
      if (typeof supplied !== 'number' || !Number.isFinite(supplied)) issue(id, 'validation.custom_field_number')
      else merged[id] = supplied
    } else {
      const parsed = z.array(PositivePostgresBigintIdSchema).safeParse(Array.isArray(supplied) ? supplied : [supplied])
      if (parsed.success && !field.multiple && parsed.data.length > 1) {
        issue(id, 'validation.custom_field_single_selection')
        continue
      }
      const previous = customFieldOptionIds(current[id])
      if (!parsed.success || new Set(parsed.data).size !== parsed.data.length || parsed.data.some(optionId => {
        const option = field.options.find(item => item.id === optionId)
        return !option || (!option.active && !previous.includes(optionId))
      })) issue(id, 'validation.invalid_selection')
      else merged[id] = parsed.data
    }
  }
  for (const field of definitions) {
    if (field.active && field.required && !customFieldHasValue(merged[field.id])) issue(field.id, 'validation.required')
  }
  return merged
})

export const WorkflowMemberConditionsSchema = z.array(z.object({
  fieldId: PositivePostgresBigintIdSchema,
  optionIds: z.array(PositivePostgresBigintIdSchema).min(1, { error: 'validation.required' })
})).superRefine((conditions, ctx) => {
  const seen = new Set<string>()
  conditions.forEach((condition, index) => {
    if (seen.has(condition.fieldId)) ctx.addIssue({ code: 'custom', path: [index, 'fieldId'], message: 'validation.duplicate' })
    seen.add(condition.fieldId)
    if (new Set(condition.optionIds).size !== condition.optionIds.length) {
      ctx.addIssue({ code: 'custom', path: [index, 'optionIds'], message: 'validation.duplicate' })
    }
  })
})
export type WorkflowMemberCondition = z.infer<typeof WorkflowMemberConditionsSchema>[number]

export const workflowConditionsMatch = (conditions: WorkflowMemberCondition[], values: AgreementCustomFieldValues): boolean =>
  conditions.every(condition => customFieldOptionIds(values[condition.fieldId]).some(optionId => condition.optionIds.includes(optionId)))
