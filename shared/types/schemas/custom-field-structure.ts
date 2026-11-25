import { z } from 'zod'
import { MoneySchema } from './money'
import { isCanonicalMoney } from '../../utils/money'

const entryId = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/u).refine(id => !Object.hasOwn(Object.prototype, id))
const label = z.string().trim().min(1).max(500).regex(/^[^\0\p{Surrogate}]+$/u)
const identity = { id: entryId, labelEn: label, labelFr: label }
const member = { ...identity, required: z.boolean() }
const columnSchema = z.strictObject({ ...member, kind: z.enum(['text', 'number', 'date']) })
const uniqueIds = (items: { id: string }[]) => new Set(items.map(item => item.id)).size === items.length
const childSchema = z.strictObject({
  ...member,
  kind: z.enum(['text', 'number', 'date', 'email', 'currency', 'relational']),
  multiple: z.boolean().optional(),
  presentation: z.enum(['single_line', 'multiline', 'checkboxes']).optional(),
  options: z.array(z.strictObject(identity)).min(1, { error: 'validation.required' }).max(100).refine(uniqueIds, { error: 'validation.duplicate' }).optional(),
  minimum: z.number().optional(),
  maximum: z.number().optional(),
  decimalPlaces: z.int().min(0).max(324).optional()
}).refine(field => {
  const relational = field.kind === 'relational'
  return relational === Boolean(field.options)
    && (!field.multiple || relational)
    && (field.presentation !== 'checkboxes' || (relational && field.multiple))
    && (field.presentation !== 'multiline' || field.kind === 'text')
    && (field.kind === 'number' || (field.minimum === undefined && field.maximum === undefined && field.decimalPlaces === undefined))
}, { error: 'validation.invalid_selection' }).refine(
  field => field.minimum === undefined || field.maximum === undefined || field.minimum <= field.maximum,
  { path: ['maximum'], error: 'validation.custom_field_range_order' }
)

const maxRows = z.int({ error: 'validation.custom_field_row_limit_config' }).min(1, { error: 'validation.custom_field_row_limit_config' }).max(100, { error: 'validation.custom_field_row_limit_config' })
export const CustomFieldStructureSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('table'), maxRows, totals: z.enum(['none', 'rows', 'columns', 'both']),
    columns: z.array(columnSchema).min(1, { error: 'validation.required' }).max(30).refine(uniqueIds, { error: 'validation.duplicate' })
  }),
  z.strictObject({
    kind: z.literal('repeating'), maxRows,
    fields: z.array(childSchema).min(1, { error: 'validation.required' }).max(30).refine(uniqueIds, { error: 'validation.duplicate' })
  })
])
export type CustomFieldStructure = z.infer<typeof CustomFieldStructureSchema>
export const CustomFieldStructuredAnswerSchema = z.strictObject({
  rows: z.array(z.strictObject({
    id: entryId,
    cells: z.record(entryId, z.union([z.string().max(5000).regex(/^[^\0\p{Surrogate}]*$/u), z.number(), z.array(entryId).max(100), MoneySchema]))
  })).max(100).refine(uniqueIds)
})
export type CustomFieldStructuredAnswer = z.infer<typeof CustomFieldStructuredAnswerSchema>

export const customFieldEmailSchema = z.email({ error: 'validation.custom_field_email' })
export const customFieldDateSchema = z.iso.date({ error: 'validation.custom_field_date' })
  .refine(value => !value.startsWith('0000-'), { error: 'validation.custom_field_date' })
const decimalSchema = z.string().max(500).regex(/^-?(?:\d+(?:\.\d+)?|\.\d+)$/u)

/**
 * Sums table decimal strings without losing precision.
 * @param values - Decimal cell drafts.
 * @returns An exact sum or null for an invalid draft.
 */
const sumDecimals = (values: string[]): string | null => {
  const populated = values.filter(value => value.trim() !== '')
  if (populated.some(value => !decimalSchema.safeParse(value).success)) return null
  const scale = Math.max(0, ...populated.map(value => value.split('.')[1]?.length ?? 0))
  let total = BigInt(0)
  for (const value of populated) {
    const [whole = '', fraction = ''] = value.replace(/^-/, '').split('.')
    const digits = BigInt((whole || '0') + fraction.padEnd(scale, '0'))
    total += value.startsWith('-') ? -digits : digits
  }
  const negative = total < BigInt(0)
  const digits = (negative ? -total : total).toString().padStart(scale + 1, '0')
  const formatted = scale
    ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}`.replace(/0+$/u, '').replace(/\.$/u, '')
    : digits
  return negative ? `-${formatted}` : formatted
}

/**
 * @param columns - Captured table columns.
 * @param rows - Ordered table rows.
 * @returns Exact numeric totals keyed by row and column ID.
 */
export const customFieldTableTotals = (
  columns: Extract<CustomFieldStructure, { kind: 'table' }>['columns'],
  rows: CustomFieldStructuredAnswer['rows']
) => {
  const numbers = columns.filter(column => column.kind === 'number')
  const value = (row: CustomFieldStructuredAnswer['rows'][number], id: string) => {
    const cell = row.cells[id]
    return cell === undefined ? '' : typeof cell === 'string' ? cell : 'invalid'
  }
  return {
    rows: Object.fromEntries(rows.map(row => [row.id, sumDecimals(numbers.map(column => value(row, column.id)))])),
    columns: Object.fromEntries(numbers.map(column => [column.id, sumDecimals(rows.map(row => value(row, column.id)))]))
  }
}

/**
 * @param value - A finite numeric answer.
 * @returns Fractional digits in its canonical decimal representation.
 */
export const customFieldDecimalPlaces = (value: number): number => {
  const [coefficient = '', exponent = '0'] = String(value).split('e')
  return Math.max(0, (coefficient.split('.')[1]?.length ?? 0) - Number(exponent))
}

/**
 * Checks an answer against the Claim's captured definition.
 * @param structure - Captured table or repeat definition.
 * @param answer - Submitted rows.
 * @param requireAnswers - Whether missing required cells block the operation.
 * @param issue - Reports a relative validation path and localized message key.
 * @param currency - Owning Agreement denomination, when known.
 */
export const validateStructuredCustomField = (
  structure: CustomFieldStructure,
  answer: CustomFieldStructuredAnswer,
  requireAnswers: boolean,
  issue: (path: (string | number)[], message: string, missing?: { row: number; labelEn: string; labelFr: string }) => void,
  currency?: string
) => {
  if (answer.rows.length > structure.maxRows) issue([], 'validation.custom_field_row_limit')
  const fields = structure.kind === 'table' ? structure.columns : structure.fields
  answer.rows.forEach((row, index) => {
    const path = (id: string) => ['rows', index, 'cells', id]
    for (const id of Object.keys(row.cells)) {
      if (!fields.some(field => field.id === id)) issue(path(id), 'validation.invalid_selection')
    }
    for (const field of fields) {
      const cell = row.cells[field.id]
      const blank = cell === undefined
        || (field.kind === 'relational' && Array.isArray(cell) && cell.length === 0)
        || (field.kind !== 'relational' && field.kind !== 'currency' && (field.kind !== 'number' || structure.kind === 'table')
          && typeof cell === 'string' && !cell.trim())
      if (blank) {
        if (requireAnswers && field.required) {
          issue(path(field.id), 'validation.required', { row: index + 1, labelEn: field.labelEn, labelFr: field.labelFr })
        }
        continue
      }
      let error: string | undefined
      if (field.kind === 'number') {
        if (structure.kind === 'table') {
          if (!decimalSchema.safeParse(cell).success) error = 'validation.custom_field_number'
        } else if (typeof cell !== 'number'
          || ('minimum' in field && field.minimum !== undefined && cell < field.minimum)
          || ('maximum' in field && field.maximum !== undefined && cell > field.maximum)
          || ('decimalPlaces' in field && field.decimalPlaces !== undefined && customFieldDecimalPlaces(cell) > field.decimalPlaces)) {
          error = 'validation.custom_field_number'
        }
      } else if (field.kind === 'currency') {
        if (!isCanonicalMoney(cell)) error = 'validation.invalid_number'
        else if (currency && cell.currency !== currency.toUpperCase()) error = 'validation.invalid_selection'
      } else if (field.kind === 'date') {
        if (!customFieldDateSchema.safeParse(cell).success) error = 'validation.custom_field_date'
      } else if (field.kind === 'email') {
        if (!customFieldEmailSchema.safeParse(cell).success) error = 'validation.custom_field_email'
      } else if (field.kind === 'relational') {
        if (!Array.isArray(cell) || (!field.multiple && cell.length > 1)
          || new Set(cell).size !== cell.length || cell.some(id => !field.options?.some(option => option.id === id))) {
          error = 'validation.invalid_selection'
        }
      } else if (typeof cell !== 'string') {
        error = 'validation.invalid_selection'
      } else if ((!('presentation' in field) || field.presentation !== 'multiline') && /[\r\n\u2028\u2029]/u.test(cell)) {
        error = 'validation.custom_field_single_line'
      }
      if (error) issue(path(field.id), error)
    }
  })
}
