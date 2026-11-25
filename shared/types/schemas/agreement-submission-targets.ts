import { z } from 'zod'
import { PositivePostgresBigintIdSchema } from './common'
import {
  FundingCaseAgreementBudgetLineItemBaseSchema,
  FundingCaseAgreementBudgetLineDescriptionSchema
} from './funding-case-agreement'
import { NonNegativeMoneySchema } from './money'
import { AgreementCustomFieldValuesSchema } from './agreement-custom-fields'

const id = PositivePostgresBigintIdSchema
const month = z.number().int().min(0).max(11)
const optionalLabel = z.string().max(255).nullish().transform(value => value ?? null)

const claim = z.object({
  applicantRecipientId: id,
  fiscalYearId: id,
  isFinalForYear: z.boolean(),
  periodStart: month,
  periodEnd: month,
  customFields: AgreementCustomFieldValuesSchema.optional(),
  receivedDate: z.iso.date({ error: 'validation.invalid_claim_received_date' })
    .refine(value => !value.startsWith('0000-'), { error: 'validation.invalid_claim_received_date' }),
  lineItems: z.array(z.object({
    sourceLineId: z.string({ error: 'validation.invalid_selection' })
      .min(1, { error: 'validation.required' })
      .max(255, { error: 'validation.max_length' })
      .refine(value => value.trim() === value && !value.includes('\u0000'), { error: 'validation.invalid_selection' })
      .optional(),
    budgetLineItemId: id.nullish().transform(value => value ?? null),
    submittedCostCategory: optionalLabel,
    submittedCostSubsection: optionalLabel,
    submittedLineItem: optionalLabel,
    description: z.string().trim().min(1, { error: 'validation.required' }),
    amount: NonNegativeMoneySchema
  })).max(500).superRefine((lines, ctx) => {
    const sourceIds = new Set<string>()
    lines.forEach(({ sourceLineId }, index) => {
      if (sourceLineId === undefined) return
      if (sourceIds.has(sourceLineId)) {
        ctx.addIssue({ code: 'custom', path: [index, 'sourceLineId'], message: 'validation.duplicate_claim_source_line_id' })
      }
      sourceIds.add(sourceLineId)
    })
  })
}).refine(value => value.periodStart <= value.periodEnd, {
  error: 'validation.date_range',
  path: ['periodEnd']
})

const forecast = z.object({
  applicantRecipientId: id,
  fiscalYearId: id,
  lineItems: z.array(z.object({
    budgetLineItemId: id,
    month,
    amount: NonNegativeMoneySchema,
    totalAmount: NonNegativeMoneySchema.optional()
  })).min(1).max(2400)
})

const budgetLine = FundingCaseAgreementBudgetLineItemBaseSchema
  .omit({ egcs_fc_fundingagreementbudgetfiscalyear: true })
  .extend({
    id: id.optional(),
    egcs_fc_totalamount: NonNegativeMoneySchema.optional(),
    egcs_fc_costsubsection: z.string().max(255).default(''),
    egcs_fc_costsubsection_fr: z.string().max(255).default(''),
    egcs_fc_description: z.string().default(''),
    egcs_fc_description_fr: z.string().default('')
  })
  .refine(value => FundingCaseAgreementBudgetLineDescriptionSchema.safeParse(value).success, {
    error: 'validation.required',
    path: ['egcs_fc_description']
  })

const amendment_budget = z.object({
  fiscalYears: z.array(z.object({
    fiscalYearId: id,
    lineItems: z.array(budgetLine).max(500)
  })).max(100)
}).superRefine(({ fiscalYears }, ctx) => {
  const years = new Set<string>()
  const retainedLines = new Set<string>()
  fiscalYears.forEach((year, yearIndex) => {
    if (years.has(year.fiscalYearId)) {
      ctx.addIssue({ code: 'custom', path: ['fiscalYears', yearIndex, 'fiscalYearId'], message: 'validation.invalid_selection' })
    }
    years.add(year.fiscalYearId)
    year.lineItems.forEach((line, lineIndex) => {
      if (line.id === undefined) return
      if (retainedLines.has(line.id)) {
        ctx.addIssue({ code: 'custom', path: ['fiscalYears', yearIndex, 'lineItems', lineIndex, 'id'], message: 'validation.invalid_selection' })
      }
      retainedLines.add(line.id)
    })
  })
})

export const agreementSubmissionTargetSchemas = { claim, forecast, amendment_budget }
export type AgreementSubmissionTargetKind = keyof typeof agreementSubmissionTargetSchemas
