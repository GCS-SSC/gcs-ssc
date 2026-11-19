import { z } from 'zod'
import { CHECKLIST_RESULTS } from './checklist/checklist'
import { PositivePostgresBigintIdSchema } from './common'

export const AgencyReviewClauseRuleSchema = z.object({
  egcs_ay_reviewschema: PositivePostgresBigintIdSchema,
  egcs_ay_result: z.enum(CHECKLIST_RESULTS, { error: 'validation.checklist_result_required' }).nullable().optional(),
  egcs_ay_outcome: z.string().trim().min(1, { error: 'validation.required' }).nullable().optional(),
  egcs_ay_strategy: z.string().min(1, { error: 'validation.required' }).nullable().optional(),
  egcs_ay_clause: PositivePostgresBigintIdSchema,
  egcs_ay_protected: z.boolean().meta({ formRequired: false })
}).superRefine((rule, ctx) => {
  if (rule.egcs_ay_result === null) {
    if (!rule.egcs_ay_outcome) ctx.addIssue({ code: 'custom', path: ['egcs_ay_outcome'], message: 'validation.required' })
    if (!rule.egcs_ay_strategy) ctx.addIssue({ code: 'custom', path: ['egcs_ay_strategy'], message: 'validation.required' })
    return
  }
  if (!rule.egcs_ay_result || rule.egcs_ay_outcome || rule.egcs_ay_strategy) {
    ctx.addIssue({ code: 'custom', path: ['egcs_ay_result'], message: 'validation.checklist_result_required' })
  }
})

export const assessmentClauseOutcomeKey = (group: string, outcome: string) => `${group}::${outcome}`

export type AgencyReviewClauseRuleItem = z.infer<typeof AgencyReviewClauseRuleSchema> & {
  id: string
  checklistNameEn: string
  checklistNameFr: string
  outcomeNameEn?: string
  outcomeNameFr?: string
  strategyNameEn?: string
  strategyNameFr?: string
  clauseNameEn: string
  clauseNameFr: string
}
