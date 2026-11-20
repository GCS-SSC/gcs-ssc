import { z } from 'zod'
import { isRepresentableByNumeric } from '../../utils/decimal'
import { PositivePostgresBigintIdSchema } from './common'
import { CHECKLIST_RESULTS } from './checklist/checklist'
import type { WorkflowMemberCondition, WorkflowResultCondition } from './agreement-custom-fields'
import type { AssessmentEntityHelperDefinition } from '../../utils/assessment-helpers'
import { MoneySchema } from './money'

const resultValue = z.union([
  z.number().refine(value => isRepresentableByNumeric(value, 10, 2), { error: 'validation.numeric_not_representable' }),
  z.boolean(),
  z.enum(CHECKLIST_RESULTS)
])
const positiveIds = z.array(PositivePostgresBigintIdSchema)
const assessmentHelperValue = z.union([z.string(), z.number(), z.boolean(), positiveIds, MoneySchema, z.null()])
const assessmentScenario = z.strictObject({
  helpers: z.record(z.string(), assessmentHelperValue).optional(),
  answers: z.array(z.strictObject({
    section: z.string().min(1),
    subsection: z.string().min(1),
    question: z.string().min(1),
    value: z.number()
  })).optional()
})
const approvalOutcome = z.enum(['succeeded', 'denied', 'failed', 'cancelled', 'unsuccessful'])

export const WorkflowSimulationSchema = z.strictObject({
  customFields: z.record(PositivePostgresBigintIdSchema, positiveIds).optional(),
  profile: z.strictObject({
    agreement_subtype: PositivePostgresBigintIdSchema.nullable().optional(),
    amendment_type: positiveIds.optional(),
    amendment_subtype: positiveIds.optional(),
    further_distribution: z.boolean().optional(),
    recipient_subtype: z.array(PositivePostgresBigintIdSchema.nullable()).optional(),
    jv_fiscal_eligible: z.boolean().optional(),
    jv_payment_final: z.boolean().optional(),
    jv_rationale_present: z.boolean().optional()
  }).optional(),
  outcomes: z.record(PositivePostgresBigintIdSchema, z.strictObject({
    state: approvalOutcome.optional(),
    results: z.record(PositivePostgresBigintIdSchema, resultValue).optional(),
    assessments: z.record(PositivePostgresBigintIdSchema, assessmentScenario).optional()
  })).optional()
})

export type WorkflowSimulationScenario = z.infer<typeof WorkflowSimulationSchema>
export type WorkflowSimulationResultValue = z.infer<typeof resultValue>
export type WorkflowSimulationAssessmentScenario = z.infer<typeof assessmentScenario>
export type WorkflowSimulationAssessmentHelperValue = z.infer<typeof assessmentHelperValue>
export type WorkflowSimulationOutcome = z.infer<typeof approvalOutcome>
export type WorkflowSimulationInput = {
  nestedMemberId: string
  source: WorkflowResultCondition['source']
  nameEn: string
  nameFr: string
  assessment?: {
    helpers: AssessmentEntityHelperDefinition[]
    questions: Array<{
      section: string
      subsection: string
      question: string
      nameEn: string
      nameFr: string
      options: Array<{ value: number, nameEn: string, nameFr: string }>
    }>
  }
}
export type WorkflowSimulationStep = {
  memberId: string
  sequence: number
  state: 'run' | 'awaiting_input' | 'skipped' | 'not_reached'
  reason: 'condition_unmet' | 'source_unavailable' | 'terminal' | null
  outcome: WorkflowSimulationOutcome | 'approved' | null
  allowedStates: WorkflowSimulationOutcome[]
  inputs: WorkflowSimulationInput[]
  conditions: Array<{
    condition: WorkflowMemberCondition
    nameEn: string
    nameFr: string
    actual: WorkflowSimulationResultValue | string | (string | null)[] | null
    matched: boolean
  }>
}
export type WorkflowSimulation = {
  status: WorkflowSimulationOutcome | 'approved' | 'awaiting_input' | 'blocked'
  finishReason: 'route_invalid' | 'terminal_status_required' | 'correction_approval_required' | null
  steps: WorkflowSimulationStep[]
}
