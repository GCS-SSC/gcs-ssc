import { AgreementCustomFieldValuesSchema, type AgreementCustomFieldPatch, type ClaimCustomFieldSnapshot } from '~~/shared/types/schemas/agreement-custom-fields'
import { sameCustomFieldAnswer } from '~~/shared/utils/agreement-custom-field-answers'
import type { AgreementSubmissionTarget } from '~~/shared/types/agreement-submission'
import type { ClaimSubmissionReferenceSnapshot } from '~~/shared/types/agreement-submission-database'
import { PositivePostgresBigintIdSchema } from '~~/shared/types/schemas/common'
import { matchClaimSubmissionLines } from '~~/shared/utils/agreement-submission-claim-lines'
import { isCanonicalMoney } from '~~/shared/utils/money'

export type SubmissionObject = Record<string, unknown>
type InputKind = 'text' | 'boolean' | 'month' | 'date' | 'money' | 'percent' | 'id'
export type SubmissionFields = Record<string, InputKind | { rows: SubmissionFields; required: readonly string[] }>
type RowReference = {
  row: number
  description?: string
  descriptionFr?: string
  costCategory?: string
  costSubsection?: string
  reference?: { field: string; id: string }
  month?: number
}
export type SubmissionPathPart = string | RowReference
export type SubmissionChange = { path: SubmissionPathPart[]; before: unknown; after: unknown }
type Comparison = 'snapshot' | 'budget_preview'

/**
 * Identifies references retained for matching and hidden in History.
 * @param key - Saved field name.
 * @returns Whether the field stores an internal reference.
 */
export const isSubmissionIdField = (key: string) => [
  'id', 'sourceLineId', 'budgetLineItemId', 'fiscalYearId', 'applicantRecipientId',
  'egcs_fc_applicantrecipient', 'egcs_fc_organizationcostcategory', 'egcs_fc_fundingsubtype'
].includes(key)

/**
 * Formats pinned Claim custom-field answers without consulting the current catalog.
 * @param value - Captured answer with bilingual option labels.
 * @param locale - Current display locale.
 * @returns Localized answer, or null for a blank value.
 */
export const claimCustomFieldAnswerLabel = (value: ClaimCustomFieldSnapshot[number]['value'], locale: string) => {
  if (typeof value === 'number') return new Intl.NumberFormat(locale, { maximumSignificantDigits: 21 }).format(value)
  if (Array.isArray(value)) return value.map(option => locale === 'fr' ? option.fr : option.en).join(', ')
  return value
}

/**
 * Reads answer identities retained in Claim submission evidence.
 * @param payload - Saved submission snapshot.
 * @returns Parsed answers when present and valid.
 */
export const claimCustomFieldEvidenceAnswers = (payload: unknown): AgreementCustomFieldPatch | undefined => {
  if (!isSubmissionObject(payload)) return undefined
  const result = AgreementCustomFieldValuesSchema.safeParse(payload.customFields)
  return result.success ? result.data : undefined
}

type ClaimAnswerEvidence = {
  key: string
  displayed: ClaimCustomFieldSnapshot[number]['value']
  answers?: AgreementCustomFieldPatch
}

const evidenceValue = ({ displayed }: ClaimAnswerEvidence) => Array.isArray(displayed)
  ? displayed.map(({ en, fr }) => JSON.stringify([en, fr]))
  : displayed

/**
 * Compares stable choice IDs when both snapshots include them and pinned labels for older evidence.
 * @param before - Prior field evidence and any retained raw answers.
 * @param after - Current field evidence and any retained raw answers.
 * @returns Whether the answer is semantically unchanged.
 */
export const sameClaimCustomFieldEvidence = (before: ClaimAnswerEvidence, after: ClaimAnswerEvidence) =>
  before.answers && after.answers
    ? sameCustomFieldAnswer(before.answers[before.key], after.answers[after.key])
    : sameCustomFieldAnswer(evidenceValue(before), evidenceValue(after))

const fundingSource: SubmissionFields = {
  egcs_fc_fundingsubtype: 'id',
  egcs_fc_amount: 'money',
  egcs_fc_description_en: 'text',
  egcs_fc_description_fr: 'text'
}
const budgetLine: SubmissionFields = {
  id: 'id',
  egcs_fc_applicantrecipient: 'id',
  egcs_fc_organizationcostcategory: 'id',
  egcs_fc_costsubsection: 'text',
  egcs_fc_costsubsection_fr: 'text',
  egcs_fc_description: 'text',
  egcs_fc_description_fr: 'text',
  egcs_fc_totalamount: 'money',
  egcs_fc_programfunding: 'money',
  egcs_fc_percentage: 'percent',
  egcs_fc_currency: 'text',
  egcs_fc_fundingsources: { rows: fundingSource, required: ['egcs_fc_fundingsubtype', 'egcs_fc_amount'] }
}

export const submissionFields = {
  claim: {
    applicantRecipientId: 'id',
    fiscalYearId: 'id',
    isFinalForYear: 'boolean',
    periodStart: 'month',
    periodEnd: 'month',
    receivedDate: 'date',
    lineItems: {
      rows: {
        budgetLineItemId: 'id', submittedCostCategory: 'text', submittedCostSubsection: 'text',
        submittedLineItem: 'text', description: 'text', amount: 'money'
      },
      required: ['description', 'amount']
    }
  },
  forecast: {
    applicantRecipientId: 'id',
    fiscalYearId: 'id',
    lineItems: { rows: { budgetLineItemId: 'id', month: 'month', amount: 'money', totalAmount: 'money' }, required: ['budgetLineItemId', 'month', 'amount'] }
  },
  amendment_budget: {
    fiscalYears: {
      rows: { fiscalYearId: 'id', lineItems: { rows: budgetLine, required: ['egcs_fc_organizationcostcategory', 'egcs_fc_currency'] } },
      required: ['fiscalYearId']
    }
  }
} satisfies Record<string, SubmissionFields>

const fiscalMonths = ['apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec', 'jan', 'feb', 'mar'] as const
export const fiscalMonthLabels = fiscalMonths.map(month => `agreement.claims.months.${month}`)

export const requiredSubmissionFields: Record<AgreementSubmissionTarget, readonly string[]> = {
  claim: ['applicantRecipientId', 'fiscalYearId', 'isFinalForYear', 'periodStart', 'periodEnd', 'receivedDate'],
  forecast: ['applicantRecipientId', 'fiscalYearId'],
  amendment_budget: []
}

/**
 * Recognizes a nested field group in a payload, leaving other values to the scalar viewer.
 * @param value Received JSON value.
 * @returns Whether it is a field group.
 */
export const isSubmissionObject = (value: unknown): value is SubmissionObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Resolves the locale key used by both the editor and change history.
 * @param key A payload property.
 * @returns Its translation key.
 */
export const submissionFieldKey = (key: string) => `submission.fields.${key}`

export type ClaimReferenceComparison = {
  before: ClaimSubmissionReferenceSnapshot | null | undefined
  after: ClaimSubmissionReferenceSnapshot | null
}

const claimReferenceTitle = (key: string) => {
  if (key === 'applicantRecipientId') return 'agreement.claims.submitting_proponent'
  if (key === 'fiscalYearId') return 'agreement.claims.fiscal_year'
}

/**
 * Compares Claim references using IDs and projects their pinned business labels.
 * @param input - Comparison inputs.
 * @param input.key - Payload field key.
 * @param input.before - Previous reference ID.
 * @param input.after - Current reference ID.
 * @param input.evidence - Captured labels.
 * @param input.locale - Reader locale.
 * @param input.unavailable - Display text for a missing captured label.
 * @returns Display values and whether the reference changed, without exposing either ID.
 */
export const compareClaimReference = (input: {
  key: string
  before: unknown
  after: unknown
  evidence: ClaimReferenceComparison
  locale: string
  unavailable: string
}) => {
  const title = claimReferenceTitle(input.key)
  if (!title) return undefined
  const from = PositivePostgresBigintIdSchema.safeParse(input.before).data
  const to = PositivePostgresBigintIdSchema.safeParse(input.after).data
  /**
   * Resolves a label captured by the event.
   * @param evidence - Pinned labels for one event.
   * @returns The localized label, when known.
   */
  const label = (evidence: ClaimSubmissionReferenceSnapshot | null | undefined) => {
    if (input.key === 'fiscalYearId') return evidence?.fiscalYearId
    const recipient = evidence?.applicantRecipientId
    return input.locale === 'fr' ? recipient?.fr || recipient?.en : recipient?.en || recipient?.fr
  }
  return {
    title,
    changed: from !== to,
    before: from ? label(input.evidence.before) ?? input.unavailable : undefined,
    after: to ? label(input.evidence.after) ?? input.unavailable : undefined
  }
}

/**
 * Chooses a row identity from the supported payload shapes.
 * @param value Potential payload row.
 * @returns The stable key when the row declares one.
 */
const rowIdentity = (value: unknown): string | undefined => {
  if (!isSubmissionObject(value)) return undefined
  if (typeof value.id === 'string') return value.id
  if (typeof value.fiscalYearId === 'string') return value.fiscalYearId
  if (typeof value.egcs_fc_fundingsubtype === 'string') return value.egcs_fc_fundingsubtype
  if (typeof value.budgetLineItemId === 'string') return [value.budgetLineItemId, value.month].join('/')
  return undefined
}

/**
 * Indexes repeated values by stable row identity when every row can be matched.
 * @param rows Values on one side of a comparison.
 * @param comparison - Budget preview lines without retained IDs are independent additions or removals.
 * @returns Stable row map when the comparison can match by identity.
 */
const keyedRows = (rows: unknown[], comparison: Comparison) => {
  const result = new Map<string | symbol, { value: unknown; index: number }>()
  for (const [index, value] of rows.entries()) {
    const key = rowIdentity(value) ?? (comparison === 'budget_preview' ? Symbol() : undefined)
    if (key === undefined || result.has(key)) return null
    result.set(key, { value, index })
  }
  return result
}

/**
 * Pairs Claim history by the evidence that can identify a line across snapshots.
 * @param before - Previous Claim lines.
 * @param after - Current Claim lines.
 * @returns Pairs in current order, followed by removed lines.
 */
const pairClaimLines = (before: SubmissionObject[], after: SubmissionObject[]) => {
  const matches = matchClaimSubmissionLines(before, after, 'history')
  const remaining = new Set(before.keys())
  for (const index of matches.values()) remaining.delete(index)
  const pairs = after.map((value, index) => {
    let oldIndex = matches.get(index)
    if (oldIndex === undefined) {
      // Identical evidence can be counted without inferring which duplicate changed.
      oldIndex = [...remaining].find(candidate => compareSubmissionValues(before[candidate], value).length === 0)
      if (oldIndex !== undefined) remaining.delete(oldIndex)
    }
    return { before: oldIndex === undefined ? undefined : before[oldIndex], after: value, index }
  })
  return [...pairs, ...[...remaining].map(index => ({ before: before[index], after: undefined, index }))]
}

/**
 * Pairs snapshot rows by saved identity when possible, otherwise by position.
 * @param before - Previous rows.
 * @param after - Current rows.
 * @param field - Saved field containing these rows.
 * @param comparison - Snapshot or Draft budget replacement preview.
 * @param target - The financial target whose History contains these rows.
 * @returns Pairs in current order, followed by removed rows.
 */
export const pairSubmissionRows = (
  before: unknown[], after: unknown[], field?: string, comparison: Comparison = 'snapshot', target?: AgreementSubmissionTarget
) => {
  if (target === 'claim' && field === 'lineItems' && before.every(isSubmissionObject) && after.every(isSubmissionObject)) {
    return pairClaimLines(before, after)
  }
  const rowComparison = field === 'lineItems' ? comparison : 'snapshot'
  const oldRows = keyedRows(before, rowComparison)
  const newRows = keyedRows(after, rowComparison)
  if (oldRows && newRows) {
    return [...new Set([...newRows.keys(), ...oldRows.keys()])].map(key => {
      const oldRow = oldRows.get(key)
      const newRow = newRows.get(key)
      return { before: oldRow?.value, after: newRow?.value, index: newRow?.index ?? oldRow?.index ?? 0 }
    })
  }
  return Array.from({ length: Math.max(before.length, after.length) }, (_, index) => ({
    before: before[index], after: after[index], index
  }))
}

/**
 * Identifies the row using details preserved in the compared snapshots.
 * @param value - Row from either snapshot.
 * @param row - One-based position used when the row has no recognizable details.
 * @returns Row context independent of display language.
 */
const describeRow = (value: unknown, row: number): RowReference => {
  if (!isSubmissionObject(value)) return { row }
  const description = [value.description, value.submittedLineItem, value.egcs_fc_description,
    value.egcs_fc_description_en, value.egcs_fc_costsubsection]
    .find((label): label is string => typeof label === 'string' && label.trim().length > 0)?.trim()
  const descriptionFr = [value.egcs_fc_description_fr, value.egcs_fc_costsubsection_fr]
    .find((label): label is string => typeof label === 'string' && label.trim().length > 0)?.trim()
  const field = ['budgetLineItemId', 'fiscalYearId', 'egcs_fc_fundingsubtype', 'id']
    .find(key => typeof value[key] === 'string' && value[key].length > 0)
  return {
    row,
    ...(typeof value.submittedCostCategory === 'string' && value.submittedCostCategory.trim()
      ? { costCategory: value.submittedCostCategory.trim() }
      : {}),
    ...(typeof value.submittedCostSubsection === 'string' && value.submittedCostSubsection.trim()
      ? { costSubsection: value.submittedCostSubsection.trim() }
      : {}),
    ...(description ? { description } : {}),
    ...(descriptionFr ? { descriptionFr } : {}),
    ...(field && typeof value[field] === 'string' ? { reference: { field, id: value[field] } } : {}),
    ...(typeof value.month === 'number' && fiscalMonthLabels[value.month] ? { month: value.month } : {})
  }
}

/**
 * Compares paired array rows while retaining the newer row's identifying context.
 * @param before - Older row value.
 * @param after - Newer row value.
 * @param path - Parent field path.
 * @param index - Zero-based row position.
 * @param comparison - Snapshot or Draft budget replacement preview.
 * @returns Changes beneath the identified row.
 */
const compareRows = (
  before: unknown, after: unknown, path: SubmissionPathPart[], index: number, comparison: Comparison
): SubmissionChange[] => compareSubmissionValues(before, after, [...path, describeRow(after ?? before, index + 1)], comparison)

/**
 * Compares two JSON values as field and row changes. Missing values indicate additions or removals.
 * @param before Older snapshot value.
 * @param after Newer snapshot value.
 * @param path Parent field path.
 * @param comparison - Snapshot or Draft budget replacement preview.
 * @param target - The financial target whose History is being compared.
 * @returns The changed values in display order.
 */
export const compareSubmissionValues = (
  before: unknown, after: unknown, path: SubmissionPathPart[] = [], comparison: Comparison = 'snapshot',
  target?: AgreementSubmissionTarget
): SubmissionChange[] => {
  if (Object.is(before, after)) return []
  if (isCanonicalMoney(before) && isCanonicalMoney(after)) {
    return before.amount === after.amount && before.currency === after.currency ? [] : [{ path, before, after }]
  }
  if (isSubmissionObject(before) && isSubmissionObject(after)) {
    return [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap(key =>
      compareSubmissionValues(
        Object.hasOwn(before, key) ? before[key] : undefined,
        Object.hasOwn(after, key) ? after[key] : undefined,
        [...path, key],
        comparison,
        target
      ))
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    const field = path.at(-1) === 'lineItems' ? 'lineItems' : undefined
    return pairSubmissionRows(before, after, field, comparison, path.length === 1 ? target : undefined).flatMap(row => compareRows(row.before, row.after, path, row.index, comparison))
  }
  return [{ path, before, after }]
}
