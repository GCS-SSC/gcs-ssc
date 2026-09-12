import { z } from 'zod'
import { PositivePostgresBigintIdSchema } from './common'
import { percentageHundredths } from '../../utils/budget-percentage'

export const BudgetPercentageSchema = z.number({ error: 'validation.budget_percentage' }).refine(value => {
  try {
    percentageHundredths(value)
    return true
  } catch {
    return false
  }
}, { error: 'validation.budget_percentage' })

export const AgencyCalculationFields = {
  egcs_ay_calculationmode: z.enum(['manual', 'category', 'all_other'], { error: 'validation.required' }).optional(),
  egcs_ay_sourcecategory: PositivePostgresBigintIdSchema.nullable().optional(),
  egcs_ay_percentage: BudgetPercentageSchema.nullable().optional(),
  egcs_ay_allowpercentageoverride: z.boolean().optional()
}

/**
 * Validates complete configuration while permitting sparse PATCH fields to merge on the server.
 * @param data - Complete agency configuration.
 * @param ctx - Localized validation context.
 */
export const validateAgencyCalculationFields = (data: z.infer<z.ZodObject<typeof AgencyCalculationFields>>, ctx: z.RefinementCtx) => {
  const mode = data.egcs_ay_calculationmode ?? 'manual'
  if (mode === 'manual') {
    if (data.egcs_ay_percentage != null || data.egcs_ay_sourcecategory != null || data.egcs_ay_allowpercentageoverride) {
      ctx.addIssue({ code: 'custom', message: 'validation.budget_calculation', path: ['egcs_ay_calculationmode'] })
    }
  } else {
    if (data.egcs_ay_percentage == null) ctx.addIssue({ code: 'custom', message: 'validation.budget_percentage', path: ['egcs_ay_percentage'] })
    if ((mode === 'category') !== Boolean(data.egcs_ay_sourcecategory)) ctx.addIssue({ code: 'custom', message: 'validation.budget_calculation', path: ['egcs_ay_sourcecategory'] })
  }
}
