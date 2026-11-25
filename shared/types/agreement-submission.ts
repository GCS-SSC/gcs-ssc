import { z } from 'zod'
import type { Selectable } from 'kysely'
import type {
  AgreementSubmissionEventTable,
  AgreementSubmissionTable
} from './agreement-submission-database'
import type { JsonValue } from './database'
import { PositivePostgresBigintIdSchema } from './schemas/common'

export const AGREEMENT_SUBMISSION_TARGETS = ['claim', 'forecast', 'amendment_budget'] as const
export const AGREEMENT_SUBMISSION_MODES = ['automatic', 'review'] as const
export const AGREEMENT_SUBMISSION_STATES = ['submitted', 'reviewing', 'returned', 'accepted'] as const
export type AgreementSubmissionTarget = typeof AGREEMENT_SUBMISSION_TARGETS[number]
export type AgreementSubmissionMode = typeof AGREEMENT_SUBMISSION_MODES[number]
export type AgreementSubmissionState = typeof AGREEMENT_SUBMISSION_STATES[number]
export type AgreementSubmissionEventKind = 'received' | 'review_started' | 'returned' | 'accepted'

const postgresText = (value: string) => !value.includes('\0') && !/\p{Surrogate}/u.test(value)

/**
 * Copies JSON evidence without reserving user-supplied property names.
 * @param value - Candidate JSON value.
 * @returns A JSON snapshot, or undefined if it cannot be stored as JSON.
 */
const copyJsonEvidence = (value: unknown): JsonValue | undefined => {
  if (value === null || typeof value === 'boolean') return value
  if (typeof value === 'string') return postgresText(value) ? value : undefined
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (Array.isArray(value)) {
    const items: JsonValue[] = []
    for (const item of value) {
      const copy = copyJsonEvidence(item)
      if (copy === undefined) return
      items.push(copy)
    }
    return items
  }
  if (typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return

  const entries: [string, JsonValue][] = []
  for (const [key, item] of Object.entries(value)) {
    const copy = copyJsonEvidence(item)
    if (copy === undefined || !postgresText(key)) return
    entries.push([key, copy])
  }
  return Object.fromEntries(entries)
}

export const AgreementSubmissionPayloadSchema = z.unknown().transform((value, context) => {
  const payload = copyJsonEvidence(value)
  if (payload !== null && typeof payload === 'object' && !Array.isArray(payload)) return payload
  context.addIssue({ code: 'custom', message: 'validation.invalid_json' })
  return z.NEVER
})
const sourceIdentity = z.string({ error: 'validation.required' }).trim().min(1, { error: 'validation.required' })
  .max(255, { error: 'validation.max_length' }).refine(postgresText, { error: 'validation.invalid_text_character' })
const revision = z.number({ error: 'validation.invalid_number' }).int().positive().max(2147483647, { error: 'validation.invalid_number' })
const budgetRevision = z.string({ error: 'validation.required' }).trim().min(1, { error: 'validation.required' })
  .max(512, { error: 'validation.max_length' }).refine(postgresText, { error: 'validation.invalid_text_character' })

export const AgreementSubmissionReceiptSchema = z.strictObject({
  target: z.enum(AGREEMENT_SUBMISSION_TARGETS, { error: 'validation.required' }),
  sourceSystem: sourceIdentity,
  sourceId: sourceIdentity,
  sourceRevision: sourceIdentity,
  formatVersion: revision,
  payload: AgreementSubmissionPayloadSchema,
  amendmentId: PositivePostgresBigintIdSchema.nullish(),
  expectedBudgetRevision: budgetRevision.nullish()
}).superRefine((input, context) => {
  if (input.target !== 'amendment_budget' && (input.amendmentId != null || input.expectedBudgetRevision != null)) {
    context.addIssue({ code: 'custom', path: ['amendmentId'], message: 'validation.invalid_selection' })
  }
})

const decisionDigest = z.string().regex(/^[a-f0-9]{64}$/, { error: 'validation.invalid_selection' })

export interface LinkedSubmissionOverviewReview {
  submissionId: string
  revision: number
  decisionDigest: string | null
}

export const AgreementSubmissionCommandSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('start'), revision }),
  z.strictObject({ action: z.literal('save'), revision, payload: AgreementSubmissionPayloadSchema }),
  z.strictObject({
    action: z.literal('return'),
    revision,
    expectedDecisionDigest: decisionDigest.optional(),
    payload: AgreementSubmissionPayloadSchema.optional(),
    description: z.string({ error: 'validation.required' }).trim().min(1, { error: 'validation.required' })
      .max(500, { error: 'validation.max_length' }).refine(postgresText, { error: 'validation.invalid_text_character' })
      .meta({ formRequired: true })
  }),
  z.strictObject({
    action: z.literal('accept'),
    revision,
    expectedDecisionDigest: decisionDigest.optional(),
    payload: AgreementSubmissionPayloadSchema.optional(),
    amendmentId: PositivePostgresBigintIdSchema.optional(),
    expectedBudgetRevision: budgetRevision.optional(),
    expectedBudgetConfirmation: z.string().regex(/^[a-f0-9]{64}$/, { error: 'validation.invalid_selection' }).optional()
  })
])

export const AgreementSubmissionListQuerySchema = z.union([
  z.strictObject({
    target: z.enum(['claim', 'forecast']),
    targetId: PositivePostgresBigintIdSchema
  }),
  z.strictObject({ target: z.undefined().optional(), targetId: z.undefined().optional() })
])

export type AgreementSubmissionListQuery = z.infer<typeof AgreementSubmissionListQuerySchema>

export const AgreementSubmissionBudgetPreviewSchema = z.strictObject({
  amendmentId: PositivePostgresBigintIdSchema,
  payload: AgreementSubmissionPayloadSchema
})

export type AgreementSubmissionBudgetPreview = {
  budgetVersionId: string
  revision: string
  confirmation: string
  current: Record<string, unknown>
  replacement: Record<string, unknown>
}

export type AgreementSubmissionCommand = z.infer<typeof AgreementSubmissionCommandSchema>
export type AgreementSubmissionReceipt = z.infer<typeof AgreementSubmissionReceiptSchema>
export type AgreementSubmissionBudgetPreviewInput = z.infer<typeof AgreementSubmissionBudgetPreviewSchema>
export type SubmissionRow = Omit<Selectable<AgreementSubmissionTable>, 'egcs_fc_updatedat'> & { egcs_fc_updatedat: string }
export type SubmissionEventRow = Omit<Selectable<AgreementSubmissionEventTable>, 'egcs_fc_createdat'> & {
  egcs_fc_createdat: string
  actorName: string | null
}
export interface AgreementSubmissionDetail {
  submission: SubmissionRow
  events: SubmissionEventRow[]
  updatedByName: string | null
  canReview: boolean
  canReturn: boolean
}
export interface AgreementSubmissionList {
  items: AgreementSubmissionListItem[]
  canReview: boolean
}
export type AgreementSubmissionListItem = SubmissionRow & { targetAvailable: boolean }
