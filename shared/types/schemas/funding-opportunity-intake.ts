import { z } from 'zod'
import { RequiredDateSchema } from './form-input'
import { PositivePostgresBigintIdSchema } from './common'

const requiredText = (max?: number) => {
  const schema = z.string({ error: 'validation.required' }).trim().min(1, { error: 'validation.required' })
  return max ? schema.max(max, { error: 'validation.max_length' }) : schema
}
const uniqueIds = z.array(PositivePostgresBigintIdSchema).refine(
  ids => new Set(ids.map(String)).size === ids.length, { error: 'validation.duplicate' }
)
const jsonObject = z.record(z.string(), z.json())

export const FundingOpportunityBaseSchema = z.object({
  egcs_fo_transferpaymentstream: PositivePostgresBigintIdSchema,
  egcs_fo_datestart: RequiredDateSchema,
  egcs_fo_dateend: RequiredDateSchema,
  egcs_fo_name_en: requiredText(255),
  egcs_fo_name_fr: requiredText(255),
  egcs_fo_objective_en: requiredText(),
  egcs_fo_objective_fr: requiredText(),
  egcs_fo_applicationschema: jsonObject.nullable(),
  egcs_fo_status: z.enum(['draft', 'open', 'closed']),
  egcs_fo_reviewsetups: uniqueIds,
  egcs_fo_workflowsetups: uniqueIds
})

export const FundingOpportunityCreateSchema = FundingOpportunityBaseSchema.refine(
  value => value.egcs_fo_dateend >= value.egcs_fo_datestart,
  { message: 'validation.date_range', path: ['egcs_fo_dateend'] }
)
export const FundingOpportunityPatchSchema = FundingOpportunityBaseSchema.omit({
  egcs_fo_transferpaymentstream: true
}).partial().superRefine((value, context) => {
  if (value.egcs_fo_dateend && value.egcs_fo_datestart && value.egcs_fo_dateend < value.egcs_fo_datestart) {
    context.addIssue({ code: 'custom', message: 'validation.date_range', path: ['egcs_fo_dateend'] })
  }
})

export const FundingCaseIntakeBaseSchema = z.object({
  egcs_fi_applicationid: PositivePostgresBigintIdSchema,
  egcs_fi_application: jsonObject,
  egcs_fi_fundingopportunity: PositivePostgresBigintIdSchema,
  egcs_fi_applicantrecipient: PositivePostgresBigintIdSchema
})
export const FundingCaseIntakeCreateSchema = FundingCaseIntakeBaseSchema
export const FundingCaseIntakePatchSchema = FundingCaseIntakeBaseSchema.pick({
  egcs_fi_application: true
}).partial()
